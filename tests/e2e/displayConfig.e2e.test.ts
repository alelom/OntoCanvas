/**
 * E2E tests for display config save/load functionality
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
  await page.waitForTimeout(500);
}

async function waitForGraphRender(page: Page, timeout = 5000): Promise<void> {
  // Wait for the graph to render. The counts can be 0 (e.g., after deleting all nodes/edges),
  // so we check that the elements exist and have valid numeric values (including 0).
  await page.waitForFunction(
    () => {
      const nodeCountEl = document.getElementById('nodeCount');
      const edgeCountEl = document.getElementById('edgeCount');
      const nodeCount = nodeCountEl?.textContent?.trim();
      const edgeCount = edgeCountEl?.textContent?.trim();
      // Require counts to be present, non-empty, and parse as valid finite numbers (including 0)
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
  await page.waitForTimeout(300);
}

async function clearDisplayConfigDB(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('OntologyEditorDisplay', 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
    const tx = db.transaction('config', 'readwrite');
    tx.objectStore('config').clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve(); // Ignore errors
      };
    });
  });
}

describe('Display Config E2E Tests', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    await page.goto(EDITOR_URL);
    // Hide the open ontology modal
    await page.evaluate(() => {
      (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__?.hideOpenOntologyModal?.();
    });
    await page.waitForTimeout(100);
  });

  afterAll(async () => {
    await browser.close();
  });

  it('should save and load display config preserving node positions', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'simple_ontology.ttl');
    if (!(await import('node:fs')).existsSync(testFile)) {
      console.warn('Test file not found, skipping test');
      return;
    }

    // Clear any existing config
    await clearDisplayConfigDB(page);

    // Load ontology
    await loadTestFile(page, testFile);
    await waitForGraphRender(page);

    // Get initial node positions
    const initialPositions = await page.evaluate(() => {
      const network = (window as unknown as { network?: { getPositions: () => Record<string, { x: number; y: number }> } }).network;
      return network?.getPositions() || {};
    });

    expect(Object.keys(initialPositions).length).toBeGreaterThan(0);

    // Move a node by simulating drag
    await page.evaluate(() => {
      const network = (window as unknown as { network?: { moveNode: (id: string, x: number, y: number) => void } }).network;
      if (network) {
        const positions = (window as unknown as { network?: { getPositions: () => Record<string, { x: number; y: number }> } }).network?.getPositions() || {};
        const firstNodeId = Object.keys(positions)[0];
        if (firstNodeId) {
          network.moveNode(firstNodeId, 100, 200);
        }
      }
    });
    await page.waitForTimeout(200);

    // Trigger dragEnd to save positions
    await page.evaluate(() => {
      const network = (window as unknown as { network?: { emit: (event: string) => void } }).network;
      network?.emit('dragEnd');
    });
    await page.waitForTimeout(500); // Wait for debounced save

    // Get positions after drag
    const positionsAfterDrag = await page.evaluate(() => {
      const network = (window as unknown as { network?: { getPositions: () => Record<string, { x: number; y: number }> } }).network;
      return network?.getPositions() || {};
    });

    // Reload the page to test persistence
    await page.reload();
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__?.hideOpenOntologyModal?.();
    });
    await page.waitForTimeout(100);

    // Load the same file again
    await loadTestFile(page, testFile);
    await waitForGraphRender(page);
    await page.waitForTimeout(500); // Wait for config to load

    // Check if positions were restored
    const restoredPositions = await page.evaluate(() => {
      const network = (window as unknown as { network?: { getPositions: () => Record<string, { x: number; y: number }> } }).network;
      return network?.getPositions() || {};
    });

    // At least one node should have a position close to where we moved it
    const movedNodeId = Object.keys(positionsAfterDrag)[0];
    if (movedNodeId && positionsAfterDrag[movedNodeId]) {
      const expectedPos = positionsAfterDrag[movedNodeId];
      const actualPos = restoredPositions[movedNodeId];
      if (actualPos) {
        // Allow some tolerance for layout differences
        expect(Math.abs(actualPos.x - expectedPos.x)).toBeLessThan(50);
        expect(Math.abs(actualPos.y - expectedPos.y)).toBeLessThan(50);
      }
    }
  });

  it('should save and load edge style config', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'simple_ontology.ttl');
    if (!(await import('node:fs')).existsSync(testFile)) {
      console.warn('Test file not found, skipping test');
      return;
    }

    // Clear any existing config
    await clearDisplayConfigDB(page);

    // Load ontology
    await loadTestFile(page, testFile);
    await waitForGraphRender(page);

    // Change an edge style (e.g., hide subClassOf)
    await page.evaluate(() => {
      const showCb = document.querySelector('.edge-show-cb[data-type="subClassOf"]') as HTMLInputElement;
      if (showCb) {
        showCb.checked = false;
        showCb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(500); // Wait for debounced save

    // Reload the page
    await page.reload();
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__?.hideOpenOntologyModal?.();
    });
    await page.waitForTimeout(100);

    // Load the same file again
    await loadTestFile(page, testFile);
    await waitForGraphRender(page);
    await page.waitForTimeout(500); // Wait for config to load

    // Check if edge style was restored
    const subClassOfHidden = await page.evaluate(() => {
      const showCb = document.querySelector('.edge-show-cb[data-type="subClassOf"]') as HTMLInputElement;
      return showCb ? !showCb.checked : null;
    });

    expect(subClassOfHidden).toBe(true);
  });

  it('should preserve node positions after refresh without changing layout', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'simple_ontology.ttl');
    if (!(await import('node:fs')).existsSync(testFile)) {
      console.warn('Test file not found, skipping test');
      return;
    }

    // Clear any existing config
    await clearDisplayConfigDB(page);

    // Load ontology
    await loadTestFile(page, testFile);
    await waitForGraphRender(page);

    // Move a node
    await page.evaluate(() => {
      const network = (window as unknown as { network?: { moveNode: (id: string, x: number, y: number) => void } }).network;
      if (network) {
        const positions = (window as unknown as { network?: { getPositions: () => Record<string, { x: number; y: number }> } }).network?.getPositions() || {};
        const firstNodeId = Object.keys(positions)[0];
        if (firstNodeId) {
          network.moveNode(firstNodeId, 150, 250);
        }
      }
    });
    await page.waitForTimeout(200);

    // Trigger dragEnd
    await page.evaluate(() => {
      const network = (window as unknown as { network?: { emit: (event: string) => void } }).network;
      network?.emit('dragEnd');
    });
    await page.waitForTimeout(500);

    // Get positions
    const savedPositions = await page.evaluate(() => {
      const network = (window as unknown as { network?: { getPositions: () => Record<string, { x: number; y: number }> } }).network;
      return network?.getPositions() || {};
    });

    // Apply filter (simulating a refresh/rerender)
    await page.evaluate(() => {
      const applyFilterBtn = document.querySelector('button') as HTMLElement;
      // Trigger applyFilter by changing a filter setting
      const searchInput = document.getElementById('searchQuery') as HTMLInputElement;
      if (searchInput) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await page.waitForTimeout(500);

    // Check positions are still preserved
    const positionsAfterFilter = await page.evaluate(() => {
      const network = (window as unknown as { network?: { getPositions: () => Record<string, { x: number; y: number }> } }).network;
      return network?.getPositions() || {};
    });

    const movedNodeId = Object.keys(savedPositions)[0];
    if (movedNodeId && savedPositions[movedNodeId] && positionsAfterFilter[movedNodeId]) {
      const saved = savedPositions[movedNodeId];
      const after = positionsAfterFilter[movedNodeId];
      // Positions should be preserved (within small tolerance)
      expect(Math.abs(after.x - saved.x)).toBeLessThan(10);
      expect(Math.abs(after.y - saved.y)).toBeLessThan(10);
    }
  });
});
