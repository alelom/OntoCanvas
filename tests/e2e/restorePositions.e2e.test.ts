/**
 * Saved positions are respected (#152): a node the display config doesn't place goes near its placed neighbours, and
 * changing the layout or resetting the display config can be undone with "Restore positions". Every address is
 * answered by a route.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { waitForAppReady } from './testHelpers';
import { EDITOR_URL } from './editorUrl';

const PAGES = 'https://pages.test/restore';
const CORS = { 'access-control-allow-origin': '*' };
const ontology = `@prefix : <${PAGES}/onto#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<${PAGES}/onto> rdf:type owl:Ontology .
:P rdf:type owl:Class ; rdfs:label "P" .
:A rdf:type owl:Class ; rdfs:label "A" ; rdfs:subClassOf :P .
:B rdf:type owl:Class ; rdfs:label "B" ; rdfs:subClassOf :P .
:New rdf:type owl:Class ; rdfs:label "New" ; rdfs:subClassOf :A .
`;
/** Far from where a fresh layout puts anything; New has no saved position. */
const saved = { P: { x: 4000, y: 3000 }, A: { x: 3800, y: 3300 }, B: { x: 4200, y: 3300 } };
const config = JSON.stringify({ version: 1, layoutMode: 'hierarchical-dag', nodePositions: saved });

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

async function open(): Promise<void> {
  page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(5000);
  await page.route(`${PAGES}/**`, (route) => {
    const url = route.request().url().split('?')[0];
    if (url === `${PAGES}/onto.ttl`) return route.fulfill({ status: 200, contentType: 'text/turtle', headers: CORS, body: ontology });
    if (url === `${PAGES}/onto.display.json`) return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: config });
    return route.fulfill({ status: 404, headers: CORS, body: '' });
  });
  await page.goto(`${EDITOR_URL}?onto=${encodeURIComponent(`${PAGES}/onto.ttl`)}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await waitForAppReady(page);
  await page.keyboard.press('Escape');
}

const positions = () =>
  page.evaluate(() => (window as any).__EDITOR_TEST__.getNetwork().getPositions() as Record<string, { x: number; y: number }>);
const restoreButton = () => page.locator('#restorePositions');
/** Whether P, A and B are where the display config puts them. */
const atSavedPositions = async () => {
  const pos = await positions();
  return Object.entries(saved).every(([id, p]) => Math.abs(pos[id].x - p.x) < 1 && Math.abs(pos[id].y - p.y) < 1);
};

describe('saved positions (#152)', () => {
  it('places a node without a saved position below its saved parent, not where a fresh layout would', async () => {
    await open();
    expect(await atSavedPositions()).toBe(true);
    const pos = await positions();
    expect(pos.New.y).toBeGreaterThan(pos.A.y);
    expect(Math.hypot(pos.New.x - pos.A.x, pos.New.y - pos.A.y)).toBeLessThan(600);
    expect(await restoreButton().isVisible()).toBe(false);
  });

  it('puts the nodes back with "Restore positions" after choosing another layout', async () => {
    await open();
    await page.selectOption('#layoutMode', 'hierarchical-tiers-spring');
    await expect.poll(atSavedPositions, { timeout: 5000 }).toBe(false);
    await restoreButton().click();
    await expect.poll(atSavedPositions, { timeout: 5000 }).toBe(true);
    expect(await restoreButton().isVisible()).toBe(false);
  });

  it('brings back the positions from before the first of several layout changes', async () => {
    await open();
    await page.selectOption('#layoutMode', 'hierarchical-tiers-spring');
    await page.selectOption('#layoutMode', 'hierarchical-force-downward');
    await restoreButton().click();
    await expect.poll(atSavedPositions, { timeout: 5000 }).toBe(true);
  });

  it('puts the nodes back after "Reset display config"', async () => {
    await open();
    await page.click('#resetDisplayConfig');
    await expect.poll(atSavedPositions, { timeout: 5000 }).toBe(false);
    await restoreButton().click();
    await expect.poll(atSavedPositions, { timeout: 5000 }).toBe(true);
  });
});
