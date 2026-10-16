/**
 * The "Layered (ELK)" layout (#153): elkjs is loaded only when the layout is chosen, and its positions replace the
 * default layout's once ready, keeping the tiers of the other hierarchical layouts. Every address is answered by a
 * route.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { waitForAppReady } from './testHelpers';

const PAGES = 'https://pages.test/elk';
const CORS = { 'access-control-allow-origin': '*' };
// Two branches whose leaves the DAG crosses: E is under B but listed first.
const ontology = `@prefix : <${PAGES}/onto#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<${PAGES}/onto> rdf:type owl:Ontology .
:P rdf:type owl:Class ; rdfs:label "P" .
:A rdf:type owl:Class ; rdfs:label "A" ; rdfs:subClassOf :P .
:B rdf:type owl:Class ; rdfs:label "B" ; rdfs:subClassOf :P .
:C rdf:type owl:Class ; rdfs:label "C" ; rdfs:subClassOf :A .
:D rdf:type owl:Class ; rdfs:label "D" ; rdfs:subClassOf :A .
:E rdf:type owl:Class ; rdfs:label "E" ; rdfs:subClassOf :B .
`;

let browser: Browser;
let page: Page;
let elkRequests: string[];

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
  elkRequests = [];
  page.on('request', (req) => {
    // The library itself: elk.bundled-<hash>.js when built, elkjs_lib_elk__bundled__js.js on the dev server.
    if (/elk[._]{1,2}bundled/i.test(new URL(req.url()).pathname)) elkRequests.push(req.url());
  });
  await page.route(`${PAGES}/**`, (route) => {
    const url = route.request().url().split('?')[0];
    return url === `${PAGES}/onto.ttl`
      ? route.fulfill({ status: 200, contentType: 'text/turtle', headers: CORS, body: ontology })
      : route.fulfill({ status: 404, headers: CORS, body: '' });
  });
  await page.goto(`http://localhost:5173/?onto=${encodeURIComponent(`${PAGES}/onto.ttl`)}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await waitForAppReady(page);
  await page.keyboard.press('Escape');
}

const positions = () =>
  page.evaluate(() => (window as any).__EDITOR_TEST__.getNetwork().getPositions() as Record<string, { x: number; y: number }>);

describe('the Layered (ELK) layout (#153)', () => {
  it('is in the layout drop-down, and elkjs is not loaded until it is chosen', async () => {
    await open();
    expect(await page.locator('#layoutMode option[value="elk-layered"]').textContent()).toBe('Layered (ELK)');
    expect(elkRequests).toEqual([]);
    await page.selectOption('#layoutMode', 'elk-layered');
    await expect.poll(() => elkRequests.length, { timeout: 5000 }).toBeGreaterThan(0);
  });

  it('keeps the tiers, with every parent above its children and no overlaps', async () => {
    await open();
    const dag = await positions();
    await page.selectOption('#layoutMode', 'elk-layered');
    // ELK's positions replace the default layout's once ready.
    await expect.poll(async () => JSON.stringify(await positions()) !== JSON.stringify(dag), { timeout: 5000 }).toBe(true);
    const pos = await positions();
    expect(pos.P.y).toBeLessThan(pos.A.y);
    expect(pos.A.y).toBeCloseTo(pos.B.y);
    expect(pos.C.y).toBeCloseTo(pos.E.y);
    expect(pos.A.y).toBeLessThan(pos.C.y);
    const tier = ['C', 'D', 'E'].sort((a, b) => pos[a].x - pos[b].x);
    for (let i = 1; i < tier.length; i++) expect(pos[tier[i]].x - pos[tier[i - 1]].x).toBeGreaterThan(20);
    // E sits on B's side, C and D on A's.
    expect(Math.sign(pos.E.x - pos.D.x)).toBe(Math.sign(pos.B.x - pos.A.x));
  });

  it('can be undone with "Restore positions"', async () => {
    await open();
    const before = await positions();
    await page.selectOption('#layoutMode', 'elk-layered');
    await expect.poll(async () => JSON.stringify(await positions()) !== JSON.stringify(before), { timeout: 5000 }).toBe(true);
    await page.click('#restorePositions');
    await expect.poll(async () => {
      const now = await positions();
      return Object.keys(before).every((id) => Math.abs(now[id].x - before[id].x) < 1 && Math.abs(now[id].y - before[id].y) < 1);
    }, { timeout: 5000 }).toBe(true);
  });
});
