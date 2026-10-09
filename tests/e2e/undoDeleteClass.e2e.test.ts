/**
 * Undo after deleting a class restores exactly what the delete removed (#77): the class's comment,
 * annotation, axioms and restrictions, and read-only restrictions that pointed to it. It used to bring
 * back only the label. The store change itself is unit-tested in tests/unit/storeChange.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadTestFile, waitForAppReady } from './testHelpers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '../fixtures/undo-delete-class.ttl');
const EDITOR_URL = 'http://localhost:5173/';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });
});

afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

/** Every triple in the store, blank nodes written as `_`, sorted. */
const storeTriples = (): Promise<string[]> =>
  page.evaluate(() =>
    (window as any).__EDITOR_TEST__.getQuads(null, null)
      .map((q: { subject: string; predicate: string; objectType: string; object: string }) =>
        `${q.subject.startsWith('http') ? q.subject : '_'} ${q.predicate} ${q.objectType === 'BlankNode' ? '_' : q.object}`)
      .sort()
  );

const shownEdges = (): Promise<string[]> =>
  page.evaluate(() =>
    (window as any).__EDITOR_TEST__.getRawData().edges.map((e: { from: string; to: string; type: string }) => `${e.from}->${e.to}:${e.type}`).sort()
  );

describe('Undo after deleting a class (#77)', () => {
  it('restores every triple and edge the delete removed, and redo removes them again', async () => {
    await loadTestFile(page, FIXTURE);
    const triplesBefore = await storeTriples();
    const edgesBefore = await shownEdges();
    expect(edgesBefore).toEqual(expect.arrayContaining(['Room->Wall:hasPart', 'Room->Wall:faces', 'Wall->Thing:subClassOf']));

    expect(await page.evaluate(() => (window as any).__EDITOR_TEST__.selectNodeById('Wall'))).toBe(true);
    expect(await page.evaluate(() => (window as any).__EDITOR_TEST__.performDelete())).toBe(true);
    await waitForAppReady(page);
    const triplesAfterDelete = await storeTriples();
    expect(triplesAfterDelete.some((t) => t.startsWith('http://example.org/undo#Wall '))).toBe(false);

    await page.evaluate(() => (window as any).__EDITOR_TEST__.performUndo());
    await waitForAppReady(page);
    expect(await storeTriples()).toEqual(triplesBefore);
    expect(await shownEdges()).toEqual(edgesBefore);

    await page.evaluate(() => (window as any).__EDITOR_TEST__.performRedo());
    await waitForAppReady(page);
    expect(await storeTriples()).toEqual(triplesAfterDelete);
  }, 10000);
});
