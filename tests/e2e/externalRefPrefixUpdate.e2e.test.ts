/**
 * E2E tests for verifying that prefix changes in "Manage external references" modal
 * update the UI (Object Properties, Data Properties, Annotation Properties, Classes).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { loadTestFile, waitForAppReady } from './testHelpers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const TEST_FIXTURES_DIR = join(__dirname, '../fixtures/imported-ontology');

let browser: Browser;
let page: Page;

/** Text of each row in a sidebar list (`edgeStylesContent`, `dataPropsContent`). */
function listItemTexts(p: Page, containerId: string): Promise<string[]> {
  return p.evaluate((id) => {
    const container = document.getElementById(id);
    if (!container) return [];
    return Array.from(container.querySelectorAll('div[style*="display: flex"]')).map(
      (item) => item.textContent?.trim() || ''
    );
  }, containerId);
}

/** Rendered label of the first class node (data-property nodes excluded) whose id or label matches. */
function classNodeLabel(p: Page, idPart: string, labelPart: string): Promise<string | null> {
  return p.evaluate(
    ([idSub, labelSub]) => {
      const network = (window as any).__EDITOR_TEST__.getNetwork?.();
      if (!network) return null;
      const node = network.body.data.nodes
        .get()
        .filter((n: any) => !String(n.id).startsWith('__dataprop__'))
        .find((n: any) => String(n.id).includes(idSub) || String(n.label ?? '').includes(labelSub));
      return node ? String(node.label ?? '') : null;
    },
    [idPart, labelPart]
  );
}

/** Load `file`, show external references, and wait until the view has settled. */
async function loadWithExternalRefs(p: Page, file: string): Promise<void> {
  await loadTestFile(p, file);
  const changed = await p.evaluate(() => {
    const displayExternalRefEl = document.getElementById('displayExternalRefs') as HTMLInputElement;
    if (displayExternalRefEl && !displayExternalRefEl.checked) {
      displayExternalRefEl.checked = true;
      displayExternalRefEl.dispatchEvent(new Event('change'));
      return true;
    }
    return false;
  });
  if (changed) await waitForAppReady(p);
}

/** Change the first external reference's prefix through the "Manage external references" modal, then close it. */
async function changeFirstPrefix(p: Page, newPrefix: string): Promise<void> {
  await p.click('#manageExternalRefs');
  const prefixInput = p.locator('.external-ref-prefix').first();
  await prefixInput.waitFor({ state: 'visible', timeout: 5000 });
  await prefixInput.evaluate((el, value) => {
    const input = el as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('change'));
  }, newPrefix);
  await p.click('#externalRefsCancel');
}

const findItem = (items: string[], ...needles: string[]): string | undefined =>
  items.find((text) => needles.some((n) => text.includes(n)));

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });

  // Enable debug mode for tests
  await page.evaluate(() => {
    localStorage.setItem('ontologyEditorDebug', 'true');
  });
});

afterEach(async () => {
  if (page && !page.isClosed()) {
    await page.close();
  }
});

describe('External Ref Prefix Update E2E', () => {
  it('should update Object Properties dropdown when prefix is changed', async () => {
    const childFile = join(TEST_FIXTURES_DIR, 'object-props-child.ttl');
    expect(existsSync(childFile)).toBe(true);

    await loadWithExternalRefs(page, childFile);

    await expect
      .poll(async () => findItem(await listItemTexts(page, 'edgeStylesContent'), 'connectsTo'), { timeout: 5000 })
      .toContain('base:connectsTo');

    await changeFirstPrefix(page, 'testprefix');

    // Should show "testprefix:connectsTo" instead of "base:connectsTo"
    await expect
      .poll(async () => findItem(await listItemTexts(page, 'edgeStylesContent'), 'connectsTo'), { timeout: 5000 })
      .toContain('testprefix:connectsTo');
    expect(findItem(await listItemTexts(page, 'edgeStylesContent'), 'connectsTo')).not.toContain('base:');
  });

  it('should update Data Properties dropdown when prefix is changed', async () => {
    const childFile = join(TEST_FIXTURES_DIR, 'data-props-child.ttl');
    expect(existsSync(childFile)).toBe(true);

    await loadWithExternalRefs(page, childFile);

    const createdDate = async () =>
      findItem(await listItemTexts(page, 'dataPropsContent'), 'createdDate', 'created date');
    await expect.poll(createdDate, { timeout: 5000 }).toContain('dpbase:');

    await changeFirstPrefix(page, 'testprefix');

    // Should show "testprefix:createdDate" instead of "dpbase:createdDate"
    await expect.poll(createdDate, { timeout: 5000 }).toContain('testprefix:');
    expect(await createdDate()).not.toContain('dpbase:');
  });

  it('should update class node labels when prefix is changed', async () => {
    const childFile = join(TEST_FIXTURES_DIR, 'data-props-child.ttl');
    expect(existsSync(childFile)).toBe(true);

    await loadWithExternalRefs(page, childFile);

    const baseEntityLabel = () => classNodeLabel(page, 'BaseEntity', 'Base Entity');
    await expect.poll(baseEntityLabel, { timeout: 5000 }).toContain('dpbase:');

    await changeFirstPrefix(page, 'testprefix');

    // The BaseEntity node label should be updated
    await expect.poll(baseEntityLabel, { timeout: 5000 }).toContain('testprefix:');
    expect(await baseEntityLabel()).not.toContain('dpbase:');
  });
});
