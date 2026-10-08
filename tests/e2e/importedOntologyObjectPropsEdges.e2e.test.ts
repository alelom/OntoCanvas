/**
 * E2E tests for imported object properties and edge creation.
 * Tests that edges are visible and imported properties are available in Add Edge modal.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { loadTestFile, blockExternalRequests } from './testHelpers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const TEST_FIXTURES_DIR = join(__dirname, '../fixtures/imported-ontology');
const CHILD_FILE = join(TEST_FIXTURES_DIR, 'object-props-child.ttl');
const CONNECTS_TO_URI = 'http://example.org/object-base#connectsTo';

/** Open the Add Edge modal from ChildClassA to ChildClassB and wait for it to show. */
async function openAddEdgeModal(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__EDITOR_TEST__.showAddEdgeModalForTest('ChildClassA', 'ChildClassB'));
  await page.waitForFunction(
    () => getComputedStyle(document.getElementById('editEdgeModal')!).display !== 'none',
    undefined,
    { timeout: 5000 }
  );
}

describe('Imported Object Properties and Edges E2E', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(5000);
    await blockExternalRequests(page);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });
    expect(existsSync(CHILD_FILE)).toBe(true);
    await loadTestFile(page, CHILD_FILE);
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  describe('Edge Visibility', () => {
    it('should display edge connecting ChildClassA to ChildClassB when using imported connectsTo property', async () => {
      const rendered = await page.evaluate(() => {
        const network = (window as any).__EDITOR_TEST__.getNetwork();
        return network.body.data.edges.get().map((e: any) => ({ from: e.from, to: e.to, id: String(e.id) }));
      });
      expect(rendered).toContainEqual({
        from: 'ChildClassA',
        to: 'ChildClassB',
        id: `ChildClassA->ChildClassB:${CONNECTS_TO_URI}`,
      });
    });

    it('should display edges when classes are connected via imported object property', async () => {
      // The status bar counts the drawn edges: just the one connectsTo restriction.
      const counts = await page.evaluate(() => {
        const hook = (window as any).__EDITOR_TEST__;
        return { visible: hook.getVisibleEdgeCount(), rendered: hook.getNetwork().body.data.edges.get().length };
      });
      expect(counts).toEqual({ visible: 1, rendered: 1 });
    });
  });

  describe('Add Edge Modal - Imported Properties', () => {
    it('should show imported object properties in Add Edge modal type selection', async () => {
      await openAddEdgeModal(page);

      // "o" matches both subClassOf and base:connectsTo, so the results list is shown.
      await page.locator('#editEdgeType').fill('o');
      const results = page.locator('#editEdgeTypeResults .edit-edge-type-result');
      await expect.poll(() => results.allTextContents(), { timeout: 5000 }).toContain('base:connectsTo');

      await results.filter({ hasText: 'base:connectsTo' }).click();
      expect(await page.locator('#editEdgeType').inputValue()).toBe('base:connectsTo');
    });

    it('should allow searching for imported object properties in Add Edge modal', async () => {
      await openAddEdgeModal(page);

      // A single match is selected straight away: the input then shows it in full.
      await page.locator('#editEdgeType').fill('connects');
      await expect.poll(() => page.locator('#editEdgeType').inputValue(), { timeout: 5000 }).toBe('base:connectsTo');
    });

    // "should display imported object properties with prefix in Add Edge modal" was removed: both tests
    // above assert the imported property is shown with its prefix (base:connectsTo), and the prefix
    // formatting itself is unit-tested in tests/unit/importedPropertyPrefixes.test.ts. Its setup relied on
    // a test-hook function (getExternalOntologyReferences) that no longer exists.
  });
});
