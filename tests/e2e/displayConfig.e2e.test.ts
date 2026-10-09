/**
 * E2E tests for display config save/load functionality
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { loadTestFile, waitForAppReady } from './testHelpers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const TEST_FIXTURES_DIR = join(__dirname, '../fixtures');
const TEST_FILE_NAME = 'edge-style-test.ttl';
const TEST_FILE = join(TEST_FIXTURES_DIR, TEST_FILE_NAME);
/** A class node of TEST_FILE. */
const MOVED_NODE_ID = 'ClassA';

type Positions = Record<string, { x: number; y: number }>;
interface StoredDisplayConfig {
  nodePositions?: Positions;
  edgeStyleConfig?: Record<string, { show: boolean }>;
}

async function clearDisplayConfigDB(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('OntologyEditorDisplay', 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('config')) req.result.createObjectStore('config');
      };
    });
    const tx = db.transaction('config', 'readwrite');
    tx.objectStore('config').clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  });
}

/** The display config the app saved to IndexedDB for `key` (the file name), or null. */
async function readStoredDisplayConfig(page: Page, key: string): Promise<StoredDisplayConfig | null> {
  return page.evaluate(async (k) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('OntologyEditorDisplay', 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('config')) req.result.createObjectStore('config');
      };
    });
    const value = await new Promise<unknown>((resolve) => {
      const req = db.transaction('config', 'readonly').objectStore('config').get(k);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
    db.close();
    return value as StoredDisplayConfig | null;
  }, key);
}

async function getPositions(page: Page): Promise<Positions> {
  return page.evaluate(() => (window as any).__EDITOR_TEST__.getNetwork()?.getPositions() ?? {});
}

/** Move a node the way a drag does: move it, then emit dragEnd (which persists positions). */
async function dragNodeTo(page: Page, nodeId: string, x: number, y: number): Promise<void> {
  await page.evaluate(
    ({ id, x, y }) => {
      const network = (window as any).__EDITOR_TEST__.getNetwork();
      network.moveNode(id, x, y);
      network.emit('dragEnd', { nodes: [id], edges: [] });
    },
    { id: nodeId, x, y }
  );
}

/** Whether `pos` is within `tolerance` of (x, y). */
function isNear(pos: { x: number; y: number } | undefined, x: number, y: number, tolerance: number): boolean {
  return !!pos && Math.abs(pos.x - x) < tolerance && Math.abs(pos.y - y) < tolerance;
}

async function reloadEditor(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 5000 });
  await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });
  await page.evaluate(() => (window as any).__EDITOR_TEST__?.hideOpenOntologyModal?.());
}

describe('Display Config E2E Tests', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    expect(existsSync(TEST_FILE)).toBe(true);
    browser = await launchBrowser();
    page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });
    await page.evaluate(() => (window as any).__EDITOR_TEST__?.hideOpenOntologyModal?.());
  });

  afterAll(async () => {
    await browser.close();
  });

  it('should save and load display config preserving node positions', async () => {
    await clearDisplayConfigDB(page);
    await loadTestFile(page, TEST_FILE);

    const initialPositions = await getPositions(page);
    expect(initialPositions[MOVED_NODE_ID]).toBeDefined();
    // The target must differ from where the layout put the node, or the test proves nothing.
    expect(isNear(initialPositions[MOVED_NODE_ID], 100, 200, 50)).toBe(false);

    await dragNodeTo(page, MOVED_NODE_ID, 100, 200);
    await expect
      .poll(async () => (await readStoredDisplayConfig(page, TEST_FILE_NAME))?.nodePositions?.[MOVED_NODE_ID] ?? null, {
        timeout: 5000,
      })
      .toEqual({ x: 100, y: 200 });

    await reloadEditor(page);
    await loadTestFile(page, TEST_FILE);

    await expect
      .poll(async () => isNear((await getPositions(page))[MOVED_NODE_ID], 100, 200, 50), { timeout: 5000 })
      .toBe(true);
  });

  it('should save and load edge style config', async () => {
    await clearDisplayConfigDB(page);
    await loadTestFile(page, TEST_FILE);

    const showCb = page.locator('.edge-show-cb[data-type="subClassOf"]');
    await expect.poll(() => showCb.isChecked(), { timeout: 5000 }).toBe(true);
    await page.evaluate(() => {
      const cb = document.querySelector('.edge-show-cb[data-type="subClassOf"]') as HTMLInputElement;
      cb.checked = false;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect
      .poll(async () => (await readStoredDisplayConfig(page, TEST_FILE_NAME))?.edgeStyleConfig?.subClassOf?.show ?? null, {
        timeout: 5000,
      })
      .toBe(false);

    await reloadEditor(page);
    await loadTestFile(page, TEST_FILE);

    await expect.poll(() => showCb.isChecked(), { timeout: 5000 }).toBe(false);
  });

  it('should preserve node positions after re-render without changing layout', async () => {
    await clearDisplayConfigDB(page);
    await loadTestFile(page, TEST_FILE);

    await dragNodeTo(page, MOVED_NODE_ID, 150, 250);
    await expect
      .poll(async () => (await readStoredDisplayConfig(page, TEST_FILE_NAME))?.nodePositions?.[MOVED_NODE_ID] ?? null, {
        timeout: 5000,
      })
      .toEqual({ x: 150, y: 250 });

    // Re-render the graph: changing the wrap width re-applies the filter, which replaces the network's data.
    await page.evaluate(() => {
      (window as any).__e2ePreviousNodes = (window as any).__EDITOR_TEST__.getNetwork().body.data.nodes;
      const wrapChars = document.getElementById('wrapChars') as HTMLInputElement;
      wrapChars.value = String((parseInt(wrapChars.value, 10) || 12) + 1);
      wrapChars.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(
      () => (window as any).__EDITOR_TEST__.getNetwork()?.body.data.nodes !== (window as any).__e2ePreviousNodes,
      undefined,
      { timeout: 5000 }
    );
    await waitForAppReady(page);

    const after = (await getPositions(page))[MOVED_NODE_ID];
    expect(isNear(after, 150, 250, 10)).toBe(true);
  });
});
