/**
 * E2E tests for https://github.com/alelom/OntoCanvas/issues/23: node labels became invisible
 * whenever the node fill matched the label colour, which was hardcoded to the dark slate
 * `#2c3e50`. Classes annotated `labellableRoot true` in the reported ontology landed on exactly
 * that colour and rendered as solid black boxes.
 *
 * These tests render real ontologies and assert against the colours vis-network actually holds.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { contrastRatio, MIN_CONTRAST_AA } from '../../src/lib/textContrast';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const DARK_PALETTE_FIXTURE = join(__dirname, '../fixtures/dark-palette-annotation.ttl');
const TWO_BOOL_FIXTURE = join(__dirname, '../fixtures/two-boolean-annotations.ttl');

/** The colour the label used to be hardcoded to, and the palette's darkest fill. */
const SLATE = '#2c3e50';

interface RenderedNodeColors {
  id: string;
  background: string;
  border: string;
  font: string;
  opacity?: number;
}

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
  await page.goto(EDITOR_URL);
  await page.waitForTimeout(300);
});

afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

async function loadFixture(p: Page, fixture: string, awaitedNodeId: string): Promise<void> {
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
  await p.locator('input#fileInput').setInputFiles(fixture, { timeout: 5000 });
  await p.waitForFunction(
    (id) => {
      const t = (window as any).__EDITOR_TEST__;
      const net = t?.getNetwork?.();
      return !!net?.body?.data?.nodes?.get && !!net.body.data.nodes.get(id);
    },
    awaitedNodeId,
    { timeout: 5000 }
  );
}

function renderedColors(p: Page): Promise<RenderedNodeColors[]> {
  return p.evaluate(() => (window as any).__EDITOR_TEST__.getRenderedNodeColors());
}

describe('Node label contrast (E2E)', () => {
  it('keeps labels legible when an annotation property gets the dark palette fill', async () => {
    await loadFixture(page, DARK_PALETTE_FIXTURE, 'Titleblock');
    const colors = await renderedColors(page);

    const titleblock = colors.find((c) => c.id === 'Titleblock');
    expect(titleblock).toBeDefined();
    // The fixture is built so this node takes the dark slate fill; that is the trigger.
    expect(titleblock!.background.toLowerCase()).toBe(SLATE);
    expect(titleblock!.font.toLowerCase()).not.toBe(SLATE);
    expect(contrastRatio(titleblock!.font, titleblock!.background)).toBeGreaterThanOrEqual(MIN_CONTRAST_AA);
  });

  it('gives every rendered node a label that meets WCAG AA against its fill', async () => {
    await loadFixture(page, DARK_PALETTE_FIXTURE, 'Titleblock');
    const colors = await renderedColors(page);

    expect(colors.length).toBeGreaterThan(0);
    for (const node of colors) {
      expect(node.font.toLowerCase(), `node ${node.id}`).not.toBe(node.background.toLowerCase());
      expect(
        contrastRatio(node.font, node.background),
        `node ${node.id} (fill ${node.background}, label ${node.font})`
      ).toBeGreaterThanOrEqual(MIN_CONTRAST_AA);
    }
  });

  it('flips the label colour when the user picks a dark fill in the menu', async () => {
    await loadFixture(page, TWO_BOOL_FIXTURE, 'ClassA');

    const before = (await renderedColors(page)).find((c) => c.id === 'ClassA');
    expect(before!.background.toLowerCase()).toBe('#2ecc71'); // light green default
    expect(before!.font.toLowerCase()).toBe(SLATE);

    const applied = await page.evaluate(
      (color) => (window as any).__EDITOR_TEST__.setAnnotationBooleanFill('flagA', 'true', color),
      SLATE
    );
    expect(applied).toBe(true);

    await page.waitForFunction(
      (color) => {
        const net = (window as any).__EDITOR_TEST__.getNetwork();
        return net?.body?.data?.nodes?.get('ClassA')?.color?.background?.toLowerCase() === color;
      },
      SLATE,
      { timeout: 5000 }
    );

    const after = (await renderedColors(page)).find((c) => c.id === 'ClassA');
    expect(after!.background.toLowerCase()).toBe(SLATE);
    expect(after!.font.toLowerCase()).not.toBe(SLATE);
    expect(contrastRatio(after!.font, after!.background)).toBeGreaterThanOrEqual(MIN_CONTRAST_AA);
  });
});
