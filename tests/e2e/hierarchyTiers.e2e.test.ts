/**
 * The "Tiers" tick of each relationship in the Object Properties menu (#151): the ticked relationships make the tiers
 * of the hierarchical layouts. subClassOf alone by default; the choice is saved in the display config, read back
 * from it, and cleared by "Reset display config". Every address is answered by a route.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { waitForAppReady } from './testHelpers';
import { EDITOR_URL } from './editorUrl';

const PAGES = 'https://pages.test/tiers';
const CORS = { 'access-control-allow-origin': '*' };
// A and B are both kinds of P; A contains B.
const ontology = `@prefix : <${PAGES}/onto#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<${PAGES}/onto> rdf:type owl:Ontology .
:contains rdf:type owl:ObjectProperty ; rdfs:label "contains" .
:P rdf:type owl:Class ; rdfs:label "P" .
:A rdf:type owl:Class ; rdfs:label "A" ; rdfs:subClassOf :P ,
    [ rdf:type owl:Restriction ; owl:onProperty :contains ; owl:someValuesFrom :B ] .
:B rdf:type owl:Class ; rdfs:label "B" ; rdfs:subClassOf :P .
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

/** Opens the ontology, with `config` as its display config (none when undefined). */
async function open(config?: object): Promise<void> {
  page = await browser.newPage({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  page.setDefaultTimeout(5000);
  // Save display config downloads the file when there is no save dialog.
  await page.addInitScript(() => delete (window as any).showSaveFilePicker);
  await page.route(`${PAGES}/**`, (route) => {
    const url = route.request().url().split('?')[0];
    if (url === `${PAGES}/onto.ttl`) return route.fulfill({ status: 200, contentType: 'text/turtle', headers: CORS, body: ontology });
    if (url === `${PAGES}/onto.display.json` && config) {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(config) });
    }
    return route.fulfill({ status: 404, headers: CORS, body: '' });
  });
  await page.goto(`${EDITOR_URL}?onto=${encodeURIComponent(`${PAGES}/onto.ttl`)}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await waitForAppReady(page);
  await page.keyboard.press('Escape');
  if (!(await page.locator('details#edgeStylesMenu').evaluate((el) => (el as HTMLDetailsElement).open))) {
    await page.click('details#edgeStylesMenu > summary');
  }
}

const tierBox = (type: string) => page.locator(`.edge-tier-cb[data-type="${type}"]`);
/** How far B is below A. */
const bBelowA = () =>
  page.evaluate(() => {
    const pos = (window as any).__EDITOR_TEST__.getNetwork().getPositions();
    return Math.round(pos.B.y - pos.A.y);
  });

describe('the Tiers tick of a relationship (#151)', () => {
  it('is on for subClassOf only by default: what A contains stays beside it', async () => {
    await open();
    expect(await tierBox('subClassOf').isChecked()).toBe(true);
    expect(await tierBox('contains').isChecked()).toBe(false);
    expect(await bBelowA()).toBe(0);
  });

  it('lays the graph out again when ticked: what A contains goes below it', async () => {
    await open();
    await tierBox('contains').check();
    await expect.poll(bBelowA, { timeout: 5000 }).toBeGreaterThan(0);
  });

  it('is read from the display config, and saved back into it', async () => {
    await open({ version: 1, layoutMode: 'hierarchical-tiers-spring', hierarchyRelationships: ['subClassOf', 'contains'] });
    expect(await tierBox('contains').isChecked()).toBe(true);
    expect(await bBelowA()).toBeGreaterThan(0);
    // Loading a config is not a layout change to undo (#152).
    expect(await page.locator('#restorePositions').isVisible()).toBe(false);
    const download = page.waitForEvent('download');
    await page.click('#saveDisplayConfig');
    const saved = JSON.parse(readFileSync((await (await download).path())!, 'utf-8'));
    expect(saved.hierarchyRelationships.sort()).toEqual(['contains', 'subClassOf']);
  });

  it('goes back to subClassOf only on "Reset display config"', async () => {
    await open({ version: 1, hierarchyRelationships: ['subClassOf', 'contains'] });
    await page.click('#resetDisplayConfig');
    await expect.poll(bBelowA, { timeout: 5000 }).toBe(0);
    expect(await tierBox('contains').isChecked()).toBe(false);
  });
});
