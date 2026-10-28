/**
 * An imported class is laid out again with the rest of the graph when the saved positions are dropped (#156):
 * by "Reset display config", and by choosing another layout. It used to keep the position of the loaded display
 * config while every local class moved, and ended up far from the graph. Every address is answered by a route.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { waitForAppReady } from './testHelpers';
import { EDITOR_URL } from './editorUrl';

const PAGES = 'https://pages.test/onto';
const CORS = { 'access-control-allow-origin': '*' };
const FRAME = `${PAGES}/parent#Frame`;
const child = `@prefix : <${PAGES}/child#> .
@prefix par: <${PAGES}/parent#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<${PAGES}/child> rdf:type owl:Ontology ; owl:imports <${PAGES}/parent> .
:hasFrame rdf:type owl:ObjectProperty ; rdfs:label "has frame" .
:Sheet rdf:type owl:Class ; rdfs:label "Sheet" ;
    rdfs:subClassOf [ rdf:type owl:Restriction ; owl:onProperty :hasFrame ; owl:someValuesFrom par:Frame ] .
:Note rdf:type owl:Class ; rdfs:label "Note" ; rdfs:subClassOf :Sheet .
:Legend rdf:type owl:Class ; rdfs:label "Legend" ; rdfs:subClassOf :Sheet .
`;
const parent = `@prefix : <${PAGES}/parent#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<${PAGES}/parent> rdf:type owl:Ontology .
:Frame rdf:type owl:Class ; rdfs:label "Frame" .
`;
/** The saved layout puts the imported Frame far left of the local classes. */
const config = JSON.stringify({
  version: 1,
  layoutMode: 'hierarchical-dag',
  nodePositions: {
    Sheet: { x: 0, y: 0 },
    Note: { x: -150, y: 250 },
    Legend: { x: 150, y: 250 },
    [FRAME]: { x: -6000, y: 0 },
  },
});
const files: Record<string, { type: string; body: string }> = {
  [`${PAGES}/child.ttl`]: { type: 'text/turtle', body: child },
  [`${PAGES}/child.display.json`]: { type: 'application/json', body: config },
  [`${PAGES}/parent`]: { type: 'text/turtle', body: parent },
};

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await launchBrowser();
});
afterAll(async () => {
  await browser.close();
});
beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(5000);
  await page.route(`${PAGES}/**`, (route) => {
    const file = files[route.request().url().split('?')[0]];
    return file
      ? route.fulfill({ status: 200, contentType: file.type, headers: CORS, body: file.body })
      : route.fulfill({ status: 404, headers: CORS, body: '' });
  });
  await page.goto(`${EDITOR_URL}?onto=${encodeURIComponent(`${PAGES}/child.ttl`)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 5000,
  });
  await waitForAppReady(page);
});
afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

const positions = () =>
  page.evaluate(() => (window as any).__EDITOR_TEST__.getNetwork().getPositions() as Record<string, { x: number; y: number }>);

/** How far the imported Frame is from the nearest local class. */
async function frameDistance(): Promise<number> {
  const pos = await positions();
  const frame = pos[FRAME];
  if (!frame) throw new Error(`Frame is not drawn. Nodes: ${Object.keys(pos).join(', ')}`);
  return Math.min(...['Sheet', 'Note', 'Legend'].map((id) => Math.hypot(pos[id].x - frame.x, pos[id].y - frame.y)));
}

describe('an imported class when the saved positions are dropped (#156)', () => {
  it('starts where the display config puts it', async () => {
    expect(await frameDistance()).toBeGreaterThan(5000);
  });

  it('is laid out with the rest after "Reset display config"', async () => {
    await page.click('#resetDisplayConfig');
    await expect.poll(frameDistance, { timeout: 5000 }).toBeLessThan(1000);
  });

  it('is laid out with the rest after choosing another layout', async () => {
    await page.selectOption('#layoutMode', 'hierarchical-tiers-spring');
    await expect.poll(frameDistance, { timeout: 5000 }).toBeLessThan(1000);
  });
});
