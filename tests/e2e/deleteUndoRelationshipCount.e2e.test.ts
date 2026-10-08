/**
 * E2E test: Verify that deleting a node and undoing doesn't create extra relationships.
 * 
 * Bug: After deleting "Drawing sheet" node and undoing, a lot more relationships appear
 * than the original count.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { loadTestFile, waitForAppReady } from './testHelpers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = process.env.EDITOR_URL || process.env.EDITOR_E2E_URL || 'http://localhost:5173/';
const FIXTURES_DIR = join(__dirname, '../fixtures');

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage();
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(5000);
  await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await page.waitForFunction(
    () => (window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ !== undefined,
    undefined,
    { timeout: 5000 }
  );

  // Enable debug mode for tests
  await page.evaluate(() => {
    localStorage.setItem('ontologyEditorDebug', 'true');
  });

  // Close any open modals
  await page.evaluate(() => {
    const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
    if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
  });
});

afterEach(async () => {
  if (page && !page.isClosed()) {
    await page.close();
  }
});

// Get edge count from the status bar UI (what the user actually sees)
async function getEdgeCount(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const edgeCountEl = document.getElementById('edgeCount');
    const count = edgeCountEl?.textContent?.trim() || '0';
    return parseInt(count, 10) || 0;
  });
}

describe('Delete and Undo Relationship Count Bug', () => {
  it('should not create extra relationships after deleting "Drawing sheet" node and undoing', async () => {
    const testFile = join(FIXTURES_DIR, 'aec_drawing_metadata.ttl');
    expect(existsSync(testFile)).toBe(true);
    
    // Load test file (already waits for everything)
    await loadTestFile(page, testFile);
    
    // Get initial edge count
    const initialEdgeCount = await getEdgeCount(page);
    expect(initialEdgeCount).toBeGreaterThan(0);
    
    // Select "Drawing sheet" node (setSelection is synchronous)
    const selected = await page.evaluate(() => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (!testHook?.selectNodeByLabel) return false;
      return testHook.selectNodeByLabel('Drawing sheet');
    });
    expect(selected).toBe(true);
    
    // Delete the node
    const deleted = await page.evaluate(() => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (!testHook?.performDelete) return false;
      return testHook.performDelete();
    });
    expect(deleted).toBe(true);
    
    // Edges connected to the deleted node should be removed from the status bar count
    await expect.poll(() => getEdgeCount(page), { timeout: 5000 }).toBeLessThan(initialEdgeCount);
    await waitForAppReady(page);
    
    // Undo
    await page.evaluate(() => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (!testHook?.performUndo) return;
      testHook.performUndo();
    });
    
    // The bug: edge count should be back to the initial count (29), but it was 35 (6 extra edges!)
    await expect.poll(() => getEdgeCount(page), { timeout: 5000 }).toBe(initialEdgeCount);
    // ...and it stays there once the re-render has settled.
    await waitForAppReady(page);
    expect(await getEdgeCount(page)).toBe(initialEdgeCount);
  }, 10000);
});
