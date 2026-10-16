/**
 * "Tidy with forces" (#162): off by default; ticked, the layout's positions go through a mild force relaxation, here
 * pulling a far class closer to the one it is linked to. Read from and saved in the display config, undone with
 * "Restore positions", and disabled with Force-directed. Every address is answered by a route.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { waitForAppReady } from './testHelpers';

const PAGES = 'https://pages.test/tidy';
const CORS = { 'access-control-allow-origin': '*' };
// Two broad parents side by side, and a class under the left one that refers to the far end of the right one.
const kids = (p: string) => Array.from({ length: 5 }, (_, i) => `:${p}${i} rdf:type owl:Class ; rdfs:subClassOf :${p} .`).join('\n');
const ontology = `@prefix : <${PAGES}/onto#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<${PAGES}/onto> rdf:type owl:Ontology .
:refersTo rdf:type owl:ObjectProperty .
:Root rdf:type owl:Class .
:Left rdf:type owl:Class ; rdfs:subClassOf :Root .
:Right rdf:type owl:Class ; rdfs:subClassOf :Root .
${kids('Left')}
${kids('Right')}
:Left0 rdfs:subClassOf [ rdf:type owl:Restriction ; owl:onProperty :refersTo ; owl:someValuesFrom :Right4 ] .
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

/** The length of the long relationship, Left0 → Right4. */
const longLink = () =>
  page.evaluate(() => {
    const pos = (window as any).__EDITOR_TEST__.getNetwork().getPositions();
    return Math.hypot(pos.Left0.x - pos.Right4.x, pos.Left0.y - pos.Right4.y);
  });

describe('Tidy with forces (#162)', () => {
  it('is off by default; ticked, it pulls the far linked class closer, and that can be undone', async () => {
    await open();
    expect(await page.isChecked('#tidyForces')).toBe(false);
    const before = await longLink();
    await page.check('#tidyForces');
    await expect.poll(longLink, { timeout: 5000 }).toBeLessThan(before - 20);
    await page.click('#restorePositions');
    await expect.poll(async () => Math.abs((await longLink()) - before), { timeout: 5000 }).toBeLessThan(1);
  });

  it('is read from the display config, and saved back into it', async () => {
    await open({ version: 1, tidyForces: true });
    expect(await page.isChecked('#tidyForces')).toBe(true);
    const download = page.waitForEvent('download');
    await page.click('#saveDisplayConfig');
    const saved = JSON.parse(readFileSync((await (await download).path())!, 'utf-8'));
    expect(saved.tidyForces).toBe(true);
  });

  it('is disabled with Force-directed, which is already a force simulation', async () => {
    await open();
    await page.selectOption('#layoutMode', 'force');
    await expect.poll(() => page.isDisabled('#tidyForces'), { timeout: 5000 }).toBe(true);
    await page.selectOption('#layoutMode', 'hierarchical-dag');
    await expect.poll(() => page.isDisabled('#tidyForces'), { timeout: 5000 }).toBe(false);
  });
});
