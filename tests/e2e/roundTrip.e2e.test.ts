/**
 * E2E test for idempotent round trip functionality.
 * Tests that opening a file, renaming a class through the UI, renaming it back and saving
 * results in a file identical to the original.
 * The serializer logic itself is unit tested in tests/unit/roundTrip.test.ts; this test drives the real UI and save.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { loadTestFile, waitForAppReady } from './testHelpers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const TEST_FIXTURES_DIR = join(__dirname, '../fixtures');

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage({ acceptDownloads: true });
  page.setDefaultTimeout(5000);
  await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });
});

afterEach(async () => {
  if (page && !page.isClosed()) {
    await page.close();
  }
});

async function getNodeLabel(page: Page, nodeId: string): Promise<string | null> {
  return page.evaluate((id) => {
    const node = (window as any).__EDITOR_TEST__.getRawData().nodes.find((n: any) => n.id === id);
    return node ? node.label : null;
  }, nodeId);
}

/** Rename a class the way a user does: double-click its node, edit the label, press OK. */
async function renameClass(page: Page, nodeId: string, newLabel: string): Promise<void> {
  const nodePosition = await page.evaluate((id) => {
    const network = (window as any).__EDITOR_TEST__.getNetwork?.();
    if (!network) return null;
    const canvas = document.querySelector('#network') as HTMLElement | null;
    if (!canvas) return null;
    const canvasRect = canvas.getBoundingClientRect();
    const pos = network.getPositions([id])[id];
    if (!pos) return null;
    const domPos = network.canvasToDOM({ x: pos.x, y: pos.y });
    return { x: canvasRect.left + domPos.x, y: canvasRect.top + domPos.y };
  }, nodeId);
  expect(nodePosition).not.toBeNull();

  await page.mouse.dblclick(nodePosition!.x, nodePosition!.y);
  await page.waitForSelector('#renameModal', { state: 'visible', timeout: 5000 });

  const renameInput = page.locator('#renameInput');
  await renameInput.fill(newLabel);
  await page.locator('#renameConfirm').click();

  await page.waitForFunction(
    () => {
      const modal = document.getElementById('renameModal');
      return !modal || getComputedStyle(modal).display === 'none';
    },
    undefined,
    { timeout: 5000 }
  );
  await expect.poll(() => getNodeLabel(page, nodeId), { timeout: 5000 }).toBe(newLabel);
  await waitForAppReady(page);
}

/** Save through the app (no file handle, so it downloads) and return the saved text. */
async function saveAndReadDownload(page: Page): Promise<string> {
  const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
  await page.evaluate(() => (window as any).__EDITOR_TEST__.saveTtl());
  const download = await downloadPromise;
  const path = await download.path();
  return readFileSync(path, 'utf-8');
}

async function getNodeIdByLabel(page: Page, label: string): Promise<string | null> {
  return page.evaluate((searchLabel) => {
    const node = (window as any).__EDITOR_TEST__.getRawData().nodes.find((n: any) => n.label === searchLabel);
    return node ? node.id : null;
  }, label);
}

/** Line endings and trailing whitespace only; also drops the editor's attribution comment if it adds one. */
function normalizeContent(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => !/^#\s*Created\/edited with https:\/\/alelom\.github\.io\/OntoCanvas\//.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

describe('Idempotent Round Trip E2E', () => {
  it('should produce identical file after round trip (load, rename, rename back, save)', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'test-round-trip.ttl');
    expect(existsSync(testFile)).toBe(true);
    const originalContent = readFileSync(testFile, 'utf-8');

    await loadTestFile(page, testFile);

    // "TextualNote" has label "Text"
    const nodeId = await getNodeIdByLabel(page, 'Text');
    expect(nodeId).not.toBeNull();

    await renameClass(page, nodeId!, 'TextRenamed');
    // The rename reached the store, so the round trip below really undoes an edit.
    const renamedQuads = await page.evaluate(() =>
      (window as any).__EDITOR_TEST__.getQuads(null, 'http://www.w3.org/2000/01/rdf-schema#label')
    );
    expect(renamedQuads.map((q: { object: string }) => q.object)).toContain('TextRenamed');

    await renameClass(page, nodeId!, 'Text');

    const savedContent = await saveAndReadDownload(page);
    expect(normalizeContent(savedContent)).toBe(normalizeContent(originalContent));
  });
});
