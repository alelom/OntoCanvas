/**
 * E2E test: Verify that deleting a node and undoing doesn't create extra relationships.
 * 
 * Bug: After deleting "Drawing sheet" node and undoing, a lot more relationships appear
 * than the original count.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
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
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(15000);
  
  try {
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch (err) {
    throw new Error(`Failed to load ${EDITOR_URL}. Is the dev server running? Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  
  await page.waitForTimeout(1000);
  
  // Enable debug mode for tests
  await page.evaluate(() => {
    localStorage.setItem('ontologyEditorDebug', 'true');
  });
  
  // Wait for testHook to be available (use polling to avoid timeout)
  let attempts = 0;
  while (attempts < 30) {
    const hasTestHook = await page.evaluate(() => {
      return (window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ !== undefined;
    });
    if (hasTestHook) break;
    await page.waitForTimeout(500);
    attempts++;
  }
  
  if (attempts >= 30) {
    throw new Error('testHook not available after 15 seconds. App may not have loaded properly.');
  }
  
  // Close any open modals
  await page.evaluate(() => {
    const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
    if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
  });
  await page.waitForTimeout(200);
}, 20000);

afterEach(async () => {
  if (page && !page.isClosed()) {
    await page.close();
  }
});

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
  
  // Wait for loading modal to appear (indicates file loading started)
  await page.waitForSelector('#loadingModal', { state: 'visible', timeout: 3000 }).catch(() => {
    // Loading modal might not appear if loading is very fast
  });
  
  // Wait for loading modal to disappear (indicates file loading completed)
  await page.waitForFunction(
    () => {
      const loadingModal = document.getElementById('loadingModal');
      return !loadingModal || (loadingModal as HTMLElement).style.display === 'none';
    },
    { timeout: 10000 }
  );
  
  // Wait for rawData to be populated (ensures loadTtlAndRender completed)
  // Wait for data to actually populate - use getAllEdges or getNodeIds which are available
  let attempts = 0;
  const maxAttempts = 40; // 40 * 500ms = 20 seconds max
  while (attempts < maxAttempts) {
    const hasData = await page.evaluate(() => {
      const testHook = (window as any).__EDITOR_TEST__;
      // Check if we have nodes or edges using available methods
      if (testHook?.getNodeIds) {
        const nodeIds = testHook.getNodeIds();
        if (nodeIds && nodeIds.length > 0) return true;
      }
      if (testHook?.getAllEdges) {
        const edges = testHook.getAllEdges();
        if (edges && edges.length > 0) return true;
      }
      if (testHook?.getRawDataEdges) {
        const edges = testHook.getRawDataEdges();
        if (edges && edges.length > 0) return true;
      }
      return false;
    });
    if (hasData) break;
    await page.waitForTimeout(500);
    attempts++;
  }
  
  if (attempts >= maxAttempts) {
    throw new Error(`File did not load within timeout. No nodes or edges found.`);
  }
  
  await page.waitForTimeout(500);
}


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
    console.log(`[TEST] Initial edge count: ${initialEdgeCount}`);
    
    // Select "Drawing sheet" node
    const selected = await page.evaluate(() => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (!testHook?.selectNodeByLabel) return false;
      return testHook.selectNodeByLabel('Drawing sheet');
    });
    expect(selected).toBe(true);
    await page.waitForTimeout(200);
    
    // Delete the node
    const deleted = await page.evaluate(() => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (!testHook?.performDelete) return false;
      return testHook.performDelete();
    });
    expect(deleted).toBe(true);
    
    // Wait for delete to complete and status bar to update
    await page.waitForFunction(
      (expectedInitialCount) => {
        const edgeCountEl = document.getElementById('edgeCount');
        const count = parseInt(edgeCountEl?.textContent?.trim() || '0', 10) || 0;
        // Wait until edge count is less than initial (delete completed)
        return count < expectedInitialCount;
      },
      initialEdgeCount,
      { timeout: 5000 }
    ).catch(() => {
      // If timeout, continue anyway
    });
    await page.waitForTimeout(300);
    
    // Verify edge count decreased (edges connected to deleted node should be removed)
    const edgeCountAfterDelete = await getEdgeCount(page);
    console.log(`[TEST] Edge count after delete: ${edgeCountAfterDelete}`);
    expect(edgeCountAfterDelete).toBeLessThan(initialEdgeCount);
    
    // Undo
    await page.evaluate(() => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (!testHook?.performUndo) return;
      testHook.performUndo();
    });
    
    // Wait for undo to complete and status bar to update
    await page.waitForFunction(
      (expectedInitialCount) => {
        const edgeCountEl = document.getElementById('edgeCount');
        const count = parseInt(edgeCountEl?.textContent?.trim() || '0', 10) || 0;
        // Wait until edge count is back to at least initial (undo completed)
        return count >= expectedInitialCount;
      },
      initialEdgeCount,
      { timeout: 5000 }
    ).catch(() => {
      // If timeout, continue anyway
    });
    await page.waitForTimeout(300);
    
    // Get edge count after undo
    const edgeCountAfterUndo = await getEdgeCount(page);
    console.log(`[TEST] Edge count after undo: ${edgeCountAfterUndo}`);
    console.log(`[TEST] Initial edge count: ${initialEdgeCount}`);
    
    // The bug: edge count should be 29 (same as initial), but it's 35 (6 extra edges!)
    // This test should FAIL until the bug is fixed
    expect(edgeCountAfterUndo).toBe(initialEdgeCount);
  }, 25000);
});
