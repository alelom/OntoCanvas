/**
 * E2E tests for context menu "Select all children" and "Select all parents" on class nodes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const TEST_FIXTURES_DIR = join(__dirname, '../fixtures');

async function loadTestFile(page: Page, filePath: string): Promise<void> {
  await page.evaluate(() => {
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.style.display = 'block';
      fileInput.style.visibility = 'visible';
      fileInput.style.position = 'absolute';
      fileInput.style.left = '0';
      fileInput.style.top = '0';
      fileInput.style.width = '1px';
      fileInput.style.height = '1px';
    }
  });
  await page.waitForTimeout(50);
  const fileInput = page.locator('input#fileInput');
  await fileInput.setInputFiles(filePath, { timeout: 5000 });
  await page.waitForTimeout(200);
}

async function waitForGraphRender(page: Page, timeout = 5000): Promise<void> {
  await page.waitForFunction(
    () => {
      const nodeCountEl = document.getElementById('nodeCount');
      const edgeCountEl = document.getElementById('edgeCount');
      const nodeCount = nodeCountEl?.textContent?.trim();
      const edgeCount = edgeCountEl?.textContent?.trim();
      return (
        nodeCount !== undefined &&
        nodeCount !== '' &&
        Number.isFinite(Number(nodeCount)) &&
        edgeCount !== undefined &&
        edgeCount !== '' &&
        Number.isFinite(Number(edgeCount))
      );
    },
    { timeout }
  );
  await page.waitForTimeout(150);
}

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
      () => (window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ !== undefined,
      { timeout: 5000 }
    );
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);
  });

  afterAll(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
  });

  it('Select all children selects clicked node and all descendants (transitive)', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'edge-style-test.ttl');
    expect(existsSync(testFile)).toBe(true);

    await loadTestFile(page, testFile);
    await waitForGraphRender(page);

    // Edge-style-test: ClassA -> ClassB -> ClassC. Select root (Class A), open menu, Select all children.
    const selectedByLabel = await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { selectNodeByLabel: (l: string) => boolean } }).__EDITOR_TEST__;
      return testHook?.selectNodeByLabel('Class A') ?? false;
    });
    expect(selectedByLabel).toBe(true);
    await page.waitForTimeout(100);

    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { openContextMenuForNode: (id: string) => void; getSelectedNodes: () => string[] } }).__EDITOR_TEST__;
      const nodeId = testHook?.getSelectedNodes?.()?.[0];
      if (nodeId) testHook?.openContextMenuForNode?.(nodeId);
    });
    await page.waitForTimeout(150);

    const menuVisible = await page.evaluate(() => {
      const menu = document.getElementById('contextMenu');
      return menu && (menu as HTMLElement).style.display !== 'none';
    });
    expect(menuVisible).toBe(true);

    await page.getByText('Select all children').click();
    await page.waitForTimeout(150);

    const selectedIds = await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { getSelectedNodes: () => string[] } }).__EDITOR_TEST__;
      return testHook?.getSelectedNodes?.() ?? [];
    });
    expect(selectedIds.length).toBe(3);
    const nodeIds = await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { getNodeIds: () => string[] } }).__EDITOR_TEST__;
      return testHook?.getNodeIds?.() ?? [];
    });
    for (const id of nodeIds) {
      expect(selectedIds).toContain(id);
    }
  });

  it('Select all parents selects clicked node and all ancestors (transitive)', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'edge-style-test.ttl');
    expect(existsSync(testFile)).toBe(true);

    await loadTestFile(page, testFile);
    await waitForGraphRender(page);

    // ClassC is the leaf. Open context menu on Class C, Select all parents.
    const selectedByLabel = await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { selectNodeByLabel: (l: string) => boolean } }).__EDITOR_TEST__;
      return testHook?.selectNodeByLabel('Class C') ?? false;
    });
    expect(selectedByLabel).toBe(true);
    await page.waitForTimeout(100);

    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { openContextMenuForNode: (id: string) => void; getSelectedNodes: () => string[] } }).__EDITOR_TEST__;
      const nodeId = testHook?.getSelectedNodes?.()?.[0];
      if (nodeId) testHook?.openContextMenuForNode?.(nodeId);
    });
    await page.waitForTimeout(150);

    await page.getByText('Select all parents').click();
    await page.waitForTimeout(150);

    const selectedIds = await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { getSelectedNodes: () => string[] } }).__EDITOR_TEST__;
      return testHook?.getSelectedNodes?.() ?? [];
    });
    expect(selectedIds.length).toBe(3);
    const nodeIds = await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { getNodeIds: () => string[] } }).__EDITOR_TEST__;
      return testHook?.getNodeIds?.() ?? [];
    });
    for (const id of nodeIds) {
      expect(selectedIds).toContain(id);
    }
  });
});
