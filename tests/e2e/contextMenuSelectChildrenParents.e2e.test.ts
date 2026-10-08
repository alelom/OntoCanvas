/**
 * E2E tests for context menu "Select all children" and "Select all parents" on class nodes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { loadTestFile, waitForGraphRender } from './testHelpers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const TEST_FIXTURES_DIR = join(__dirname, '../fixtures');

describe('Context menu Select all children / parents E2E', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(5000);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForFunction(
      () => (window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ !== undefined, undefined,
      { timeout: 5000 }
    );
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
  });

  afterAll(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
  });

  it('Select all children selects clicked node and all subclasses (transitive)', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'edge-style-test.ttl');
    expect(existsSync(testFile)).toBe(true);

    await loadTestFile(page, testFile);
    await waitForGraphRender(page);

    // Edge-style-test: ClassA -subClassOf-> ClassB -contains-> ClassC (plus ClassA -hasProperty-> ClassB).
    // Children follow subClassOf target->domain (subclasses) and any other property edge
    // domain->target (a known class's own property targets). Class B is ClassA's superclass
    // (so ClassA is pulled in) and is itself the domain of the `contains` edge to ClassC
    // (so ClassC is pulled in too). Select Class B, Select all children.
    const selectedByLabel = await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { selectNodeByLabel: (l: string) => boolean } }).__EDITOR_TEST__;
      return testHook?.selectNodeByLabel('Class B') ?? false;
    });
    expect(selectedByLabel).toBe(true);

    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { openContextMenuForNode: (id: string) => void; getSelectedNodes: () => string[] } }).__EDITOR_TEST__;
      const nodeId = testHook?.getSelectedNodes?.()?.[0];
      if (nodeId) testHook?.openContextMenuForNode?.(nodeId);
    });

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const menu = document.getElementById('contextMenu');
            return !!menu && (menu as HTMLElement).style.display !== 'none';
          }),
        { timeout: 5000 }
      )
      .toBe(true);

    await page.getByText('Select all children ↓').click();

    const getSelected = () =>
      page.evaluate(() => {
        const testHook = (window as unknown as { __EDITOR_TEST__?: { getSelectedNodes: () => string[] } }).__EDITOR_TEST__;
        return testHook?.getSelectedNodes?.() ?? [];
      });
    await expect.poll(async () => (await getSelected()).length, { timeout: 5000 }).toBe(3);
    const selectedIds = await getSelected();
    const nodeIds = await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { getNodeIds: () => string[] } }).__EDITOR_TEST__;
      return testHook?.getNodeIds?.() ?? [];
    });
    for (const id of nodeIds) {
      expect(selectedIds).toContain(id);
    }
  });

  it('Select all parents selects clicked node and all superclasses (transitive)', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'edge-style-test.ttl');
    expect(existsSync(testFile)).toBe(true);

    await loadTestFile(page, testFile);
    await waitForGraphRender(page);

    // Parents are the mirror: subClassOf domain->target (superclasses) and any other property
    // edge target->domain (a known class's own referencing classes). Class C is the `contains`
    // target of ClassB (so ClassB is pulled in), and ClassB is in turn the `hasProperty` target
    // of ClassA (so ClassA is pulled in too). Select Class C, Select all parents.
    const selectedByLabel = await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { selectNodeByLabel: (l: string) => boolean } }).__EDITOR_TEST__;
      return testHook?.selectNodeByLabel('Class C') ?? false;
    });
    expect(selectedByLabel).toBe(true);

    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { openContextMenuForNode: (id: string) => void; getSelectedNodes: () => string[] } }).__EDITOR_TEST__;
      const nodeId = testHook?.getSelectedNodes?.()?.[0];
      if (nodeId) testHook?.openContextMenuForNode?.(nodeId);
    });

    await page.getByText('Select all parents ↑').click();

    const getSelected = () =>
      page.evaluate(() => {
        const testHook = (window as unknown as { __EDITOR_TEST__?: { getSelectedNodes: () => string[] } }).__EDITOR_TEST__;
        return testHook?.getSelectedNodes?.() ?? [];
      });
    await expect.poll(async () => (await getSelected()).length, { timeout: 5000 }).toBe(3);
    const selectedIds = await getSelected();
    const nodeIds = await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { getNodeIds: () => string[] } }).__EDITOR_TEST__;
      return testHook?.getNodeIds?.() ?? [];
    });
    for (const id of nodeIds) {
      expect(selectedIds).toContain(id);
    }
  });
});
