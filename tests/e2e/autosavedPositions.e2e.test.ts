/**
 * The display config the app keeps in the browser after each redraw (IndexedDB) holds node positions only once the
 * user has arranged them: dragged a node, or loaded a config with positions. Positions a layout computed are laid out
 * again on the next visit, with the current layout and settings, rather than coming back as saved positions. Before,
 * an ontology opened before stacking existed (#159) reopened in rows, until the option was toggled.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { type Browser, type BrowserContext, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { waitForAppReady } from './testHelpers';
import { EDITOR_URL } from './editorUrl';

const PAGES = 'https://pages.test/autosave';
const CORS = { 'access-control-allow-origin': '*' };
const LEAVES = Array.from({ length: 10 }, (_, i) => `L${i}`);
const ontology = `@prefix : <${PAGES}/onto#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<${PAGES}/onto> rdf:type owl:Ontology .
:P rdf:type owl:Class ; rdfs:label "P" .
${LEAVES.map((l) => `:${l} rdf:type owl:Class ; rdfs:label "${l}" ; rdfs:subClassOf :P .`).join('\n')}
`;

let browser: Browser;

beforeAll(async () => {
  browser = await launchBrowser();
});
afterAll(async () => {
  await browser.close();
});

/** A page in `context` opening the ontology (no display config is published next to it). */
async function open(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  await page.route(`${PAGES}/**`, (route) =>
    route.request().url().split('?')[0] === `${PAGES}/onto.ttl`
      ? route.fulfill({ status: 200, contentType: 'text/turtle', headers: CORS, body: ontology })
      : route.fulfill({ status: 404, headers: CORS, body: '' })
  );
  await page.goto(`${EDITOR_URL}?onto=${encodeURIComponent(`${PAGES}/onto.ttl`)}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await waitForAppReady(page);
  await page.keyboard.press('Escape');
  return page;
}

const leafRows = (page: Page) =>
  page.evaluate((ids) => {
    const pos = (window as any).__EDITOR_TEST__.getNetwork().getPositions();
    return new Set(ids.map((id: string) => Math.round(pos[id].y))).size;
  }, LEAVES);

/** The display configs kept in the browser. */
const storedConfigs = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Array<Record<string, any>>>((resolve, reject) => {
        const req = indexedDB.open('OntologyEditorDisplay');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('config')) return resolve([]);
          const all = db.transaction('config').objectStore('config').getAll();
          all.onsuccess = () => resolve(all.result);
          all.onerror = () => reject(all.error);
        };
      })
  );

/** Rewrites every display config kept in the browser. */
const rewriteStoredConfigs = (page: Page, change: (config: Record<string, unknown>) => void) =>
  page.evaluate(
    (fn) =>
      new Promise<number>((resolve, reject) => {
        const apply = new Function('config', fn) as (c: Record<string, unknown>) => void;
        const req = indexedDB.open('OntologyEditorDisplay');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction('config', 'readwrite');
          const store = tx.objectStore('config');
          let count = 0;
          store.openCursor().onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
            if (!cursor) return;
            const value = cursor.value;
            apply(value);
            cursor.update(value);
            count++;
            cursor.continue();
          };
          tx.oncomplete = () => resolve(count);
        };
      }),
    `(${change.toString()})(config)`
  );

describe('positions kept in the browser between visits', () => {
  it('are laid out again when a layout computed them: a save from before stacking reopens stacked', async () => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    let page = await open(context);
    // Rows, as before #159: unticking stacking lays them out in one row.
    await page.uncheck('#stackLeaves');
    await expect.poll(() => leafRows(page), { timeout: 5000 }).toBe(1);
    // The browser's copy is saved shortly after the redraw.
    await expect.poll(async () => (await storedConfigs(page)).some((c) => c.stackLeaves === false), { timeout: 5000 }).toBe(true);
    // As a save from before #159 looks: no stackLeaves field.
    expect(await rewriteStoredConfigs(page, (config) => delete config.stackLeaves)).toBeGreaterThan(0);
    await page.close();

    page = await open(context);
    expect(await page.isChecked('#stackLeaves')).toBe(true);
    expect(await leafRows(page)).toBeGreaterThan(1);
    await context.close();
  });

  it('come back once the user has arranged the graph: a dragged node stays where it was dropped', async () => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    let page = await open(context);
    const network = () => (window as any).__EDITOR_TEST__.getNetwork();
    const before = await page.evaluate(`(${network})().getPositions().P`);
    // Drag P by 300 px on the canvas.
    const dom = await page.evaluate(`(() => { const n = (${network})(); return n.canvasToDOM(n.getPositions().P); })()`) as { x: number; y: number };
    const box = (await page.locator('#network canvas').boundingBox())!;
    await page.mouse.move(box.x + dom.x, box.y + dom.y);
    await page.mouse.down();
    await page.mouse.move(box.x + dom.x + 150, box.y + dom.y, { steps: 5 });
    await page.mouse.move(box.x + dom.x + 300, box.y + dom.y, { steps: 5 });
    await page.mouse.up();
    const dropped = await page.evaluate(`(${network})().getPositions().P`) as { x: number; y: number };
    expect(Math.abs(dropped.x - (before as { x: number }).x)).toBeGreaterThan(50);
    await expect
      .poll(async () => (await storedConfigs(page)).some((c) => Math.abs((c.nodePositions?.P?.x ?? NaN) - dropped.x) < 1), { timeout: 5000 })
      .toBe(true);
    await page.close();

    page = await open(context);
    const reopened = await page.evaluate(`(${network})().getPositions().P`) as { x: number; y: number };
    expect(Math.abs(reopened.x - dropped.x)).toBeLessThan(1);
    await context.close();
  });
});
