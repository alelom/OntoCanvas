/**
 * E2E tests for the Annotation Properties menu against the real app:
 *  - multiple boolean properties colour their own nodes (regression: the 2nd property used to be
 *    clobbered by the 1st property's "when undefined" colour);
 *  - the trash-bin delete actually removes a property (regression: it silently did nothing when
 *    the ontology base differed from BASE_IRI).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const FIXTURE = join(__dirname, '../fixtures/two-boolean-annotations.ttl');

// Defaults from src/ui/constants.ts (ANNOTATION_FILL_PALETTE + DEFAULT_NODE_FALLBACK).
const PALETTE_0 = '#2ecc71'; // first property's "when true" fill (green)
const PALETTE_1 = '#3498db'; // second property's "when true" fill (blue) - distinct from green
const DEFAULT_FILL = '#bdc3c7'; // "no property applies" default (when false/undefined are inactive)

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage();
  // Auto-accept the delete confirm() dialog (Playwright dismisses by default).
  page.on('dialog', (d) => d.accept());
  await page.goto(EDITOR_URL);
  await page.waitForTimeout(300);
});

afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

async function loadFixture(p: Page): Promise<void> {
  await p.evaluate(() => {
    const fi = document.getElementById('fileInput') as HTMLInputElement | null;
    if (fi) {
      fi.style.display = 'block';
      fi.style.visibility = 'visible';
      fi.style.position = 'absolute';
      fi.style.width = '1px';
      fi.style.height = '1px';
    }
  });
  await p.locator('input#fileInput').setInputFiles(FIXTURE, { timeout: 5000 });
  // Wait until the network has rendered the class nodes (cap 5s).
  await p.waitForFunction(
    () => {
      const t = (window as any).__EDITOR_TEST__;
      const net = t?.getNetwork?.();
      return !!net?.body?.data?.nodes?.get && net.body.data.nodes.get('ClassB');
    },
    { timeout: 5000 }
  );
}

function nodeBackgrounds(p: Page, ids: string[]): Promise<Record<string, string | undefined>> {
  return p.evaluate((nodeIds) => {
    const net = (window as any).__EDITOR_TEST__.getNetwork();
    const out: Record<string, string | undefined> = {};
    for (const id of nodeIds) out[id] = net.body.data.nodes.get(id)?.color?.background;
    return out;
  }, ids);
}

describe('Annotation Properties menu (E2E)', () => {
  it('colours each boolean property\'s own nodes with distinct defaults (multi-property regression)', async () => {
    expect(existsSync(FIXTURE)).toBe(true);
    await loadFixture(page);

    const colors = await nodeBackgrounds(page, ['ClassA', 'ClassB', 'ClassC']);

    // ClassA carries flagA=true, ClassB carries flagB=true. Each property has a distinct default
    // "when true" fill, so the two nodes are coloured differently. The original bug returned
    // flagA's "when undefined" for ClassB; assert ClassB got flagB's own colour instead.
    expect(colors.ClassA).toBe(PALETTE_0);
    expect(colors.ClassB).toBe(PALETTE_1);
    expect(colors.ClassB).not.toBe(colors.ClassA);
    // ClassC carries neither, and "when undefined" is inactive by default -> the configurable
    // default style applies.
    expect(colors.ClassC).toBe(DEFAULT_FILL);
  });

  it('deletes an annotation property via the trash-bin control', async () => {
    await loadFixture(page);

    const before = await page.evaluate(() =>
      (window as any).__EDITOR_TEST__.getAnnotationProperties().map((p: any) => p.name)
    );
    expect(before).toContain('flagA');

    // Programmatic click fires the real listener regardless of the panel's visibility.
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector('.annotation-prop-delete-btn[data-name="flagA"]') as HTMLElement | null;
      if (!btn) return false;
      btn.click();
      return true;
    });
    expect(clicked).toBe(true);

    await page.waitForFunction(
      () => !(window as any).__EDITOR_TEST__.getAnnotationProperties().some((p: any) => p.name === 'flagA'),
      { timeout: 5000 }
    );

    const after = await page.evaluate(() =>
      (window as any).__EDITOR_TEST__.getAnnotationProperties().map((p: any) => p.name)
    );
    expect(after).not.toContain('flagA');
    expect(after).toContain('flagB');

    // ClassA was coloured by flagA=true; after deletion it has no governing property (it doesn't
    // carry flagB), so it falls back to the configurable default style.
    const colors = await nodeBackgrounds(page, ['ClassA']);
    expect(colors.ClassA).toBe(DEFAULT_FILL);
  });
});
