/**
 * E2E tests for Add node mode: adding multiple nodes via toolbar Add node + canvas click.
 * Regression test: addNodeModalShowing must be reset when modal closes so the second
 * "Add node" → canvas click opens the modal again.
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

function getNodeCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.getElementById('nodeCount');
    const t = el?.textContent?.trim();
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  });
}

describe('Add node mode E2E', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(5000);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, { timeout: 5000 });
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);
  });

  afterAll(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
  });

  it('adds two nodes via Add node toolbar then canvas click (second click opens modal)', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'duplicate-add-node.ttl');
    expect(existsSync(testFile)).toBe(true);

    await loadTestFile(page, testFile);
    await waitForGraphRender(page);

    const initialCount = await getNodeCount(page);
    expect(initialCount).toBe(1);

    // 1) Click Add node toolbar button, then click canvas → modal opens
    await page.locator('.vis-add').click();
    await page.waitForTimeout(100);
    await page.locator('#network').click({ position: { x: 300, y: 250 } });
    await page.waitForTimeout(200);

    let addModalVisible = await page.evaluate(() => {
      const modal = document.getElementById('addNodeModal');
      return modal && (modal as HTMLElement).style.display !== 'none';
    });
    expect(addModalVisible).toBe(true);

    await page.locator('#addNodeInput').fill('FirstNode');
    await page.waitForTimeout(80);
    await page.locator('#addNodeConfirm').click();
    await page.waitForTimeout(300);

    const afterFirst = await getNodeCount(page);
    expect(afterFirst).toBe(2);

    // 2) Click Add node again, then canvas again → modal must open (regression: was not opening)
    await page.locator('.vis-add').click();
    await page.waitForTimeout(100);
    await page.locator('#network').click({ position: { x: 400, y: 300 } });
    await page.waitForTimeout(200);

    addModalVisible = await page.evaluate(() => {
      const modal = document.getElementById('addNodeModal');
      return modal && (modal as HTMLElement).style.display !== 'none';
    });
    expect(addModalVisible).toBe(true);

    await page.locator('#addNodeInput').fill('SecondNode');
    await page.waitForTimeout(80);
    await page.locator('#addNodeConfirm').click();
    await page.waitForTimeout(300);

    const afterSecond = await getNodeCount(page);
    expect(afterSecond).toBe(3);
  });
});
