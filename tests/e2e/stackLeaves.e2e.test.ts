/**
 * "Stack many leaves under their parent" (#159): on by default, the leaf children of a broad parent show as a block of
 * several columns under it; unticked, as one row. The choice is read from and saved in the display config. Every
 * address is answered by a route.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { waitForAppReady } from './testHelpers';

const PAGES = 'https://pages.test/stack';
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
let page: Page;

beforeAll(async () => {
  browser = await launchBrowser();
});
afterAll(async () => {
  await browser.close();
});
afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

async function open(config?: object): Promise<void> {
  page = await browser.newPage({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  page.setDefaultTimeout(5000);
  await page.addInitScript(() => delete (window as any).showSaveFilePicker);
  await page.route(`${PAGES}/**`, (route) => {
    const url = route.request().url().split('?')[0];
    if (url === `${PAGES}/onto.ttl`) return route.fulfill({ status: 200, contentType: 'text/turtle', headers: CORS, body: ontology });
    if (url === `${PAGES}/onto.display.json` && config) {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(config) });
    }
    return route.fulfill({ status: 404, headers: CORS, body: '' });
  });
  await page.goto(`http://localhost:5173/?onto=${encodeURIComponent(`${PAGES}/onto.ttl`)}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await waitForAppReady(page);
  await page.keyboard.press('Escape');
}

/** How many rows the leaves are drawn in. */
const leafRows = () =>
  page.evaluate((ids) => {
    const pos = (window as any).__EDITOR_TEST__.getNetwork().getPositions();
    return new Set(ids.map((id: string) => Math.round(pos[id].y))).size;
  }, LEAVES);

describe('Stack many leaves under their parent (#159)', () => {
  it('is on by default: the leaves are a block of several rows', async () => {
    await open();
    expect(await page.isChecked('#stackLeaves')).toBe(true);
    expect(await leafRows()).toBeGreaterThan(1);
  });

  it('puts the leaves back in one row when unticked, and that can be undone', async () => {
    await open();
    await page.uncheck('#stackLeaves');
    await expect.poll(leafRows, { timeout: 5000 }).toBe(1);
    await page.click('#restorePositions');
    await expect.poll(leafRows, { timeout: 5000 }).toBeGreaterThan(1);
  });

  it('is read from the display config, and saved back into it', async () => {
    await open({ version: 1, stackLeaves: false });
    expect(await page.isChecked('#stackLeaves')).toBe(false);
    expect(await leafRows()).toBe(1);
    const download = page.waitForEvent('download');
    await page.click('#saveDisplayConfig');
    const saved = JSON.parse(readFileSync((await (await download).path())!, 'utf-8'));
    expect(saved.stackLeaves).toBe(false);
  });
});
