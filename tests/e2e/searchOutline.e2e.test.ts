/**
 * E2E for #84: the search draws a pulsing outline (SVG overlay) around what it matched directly — a
 * class, a data-property box, or a relationship's curve — follows pans, and disappears when cleared.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { waitForAppReady } from './testHelpers';

const EDITOR_URL = 'http://localhost:5173/';

const TTL = `@prefix : <http://example.org/main#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<http://example.org/main> a owl:Ontology .
:Group a owl:Class ; rdfs:label "Group" .
:Agent a owl:Class ; rdfs:label "Agent" .
:member a owl:ObjectProperty ; rdfs:label "member" ; rdfs:domain :Group ; rdfs:range :Agent .
:knows a owl:ObjectProperty ; rdfs:label "knows" ; rdfs:domain :Agent ; rdfs:range :Agent .
:yahooChatID a owl:DatatypeProperty ; rdfs:label "Yahoo chat ID" ; rdfs:domain :Agent ; rdfs:range xsd:string .
`;

describe('Search outline E2E (#84)', () => {
  let browser: Browser;
  let page: Page;

  const shapes = () =>
    page.evaluate(() => {
      const g = document.querySelector('#searchOutlineOverlay g');
      return {
        rects: g ? g.querySelectorAll('rect.oc-mark').length : -1,
        paths: g ? g.querySelectorAll('path.oc-mark').length : -1,
        transform: g?.getAttribute('transform') ?? null,
        markup: g?.innerHTML ?? '',
      };
    });
  const search = async (q: string) => {
    await page.fill('#searchQuery', q);
    await page.keyboard.press('Escape'); // close the suggestions
  };

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__?.loadTtlDirectly !== undefined, undefined, { timeout: 5000 });
    await page.evaluate(() => (window as any).__EDITOR_TEST__?.hideOpenOntologyModal?.());
    await page.evaluate((t) => (window as any).__EDITOR_TEST__.loadTtlDirectly(t), TTL);
    await waitForAppReady(page);
    await page.waitForFunction(() => ((window as any).__EDITOR_TEST__?.getRawDataEdges?.() ?? []).length > 0, undefined, { timeout: 5000 });
    await page.evaluate(() => (window as any).__EDITOR_TEST__?.hideOpenOntologyModal?.());
    await page.keyboard.press('Escape');
  });

  afterAll(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
  });

  it('outlines a matched class only (not its neighbours)', async () => {
    await search('Group');
    await expect.poll(shapes, { timeout: 5000 }).toMatchObject({ rects: 1, paths: 0 });
  });

  it('outlines a matched relationship along its curve, not its endpoints', async () => {
    await search('member');
    await expect.poll(async () => (await shapes()).paths, { timeout: 5000 }).toBeGreaterThan(0);
    expect((await shapes()).rects).toBe(0);
  });

  it('outlines a self-loop relationship around its loop (like foaf:fundedBy on owl:Thing)', async () => {
    await search('knows');
    await expect.poll(async () => (await shapes()).paths, { timeout: 5000 }).toBeGreaterThan(0);
    expect((await shapes()).rects).toBe(0);
  });

  it('outlines a matched data property box', async () => {
    await search('yahooChatID'); // "Exact match" is on by default
    await expect.poll(shapes, { timeout: 5000 }).toMatchObject({ rects: 1, paths: 0 });
  });

  it('follows a pan by moving the group only (shapes unchanged)', async () => {
    // Let the search's re-render fit the view, and any animation it started end, or it would undo the pan:
    // the view is still once two polls 150 ms apart read the same position.
    await waitForAppReady(page);
    const viewNow = () => page.evaluate(() => JSON.stringify((window as any).__EDITOR_TEST__.getNetwork().getViewPosition()));
    let previousView: string | null = null;
    await expect
      .poll(async () => {
        const now = await viewNow();
        const still = now === previousView;
        previousView = now;
        return still;
      }, { timeout: 5000, intervals: [150] })
      .toBe(true);
    const before = await shapes();
    await page.evaluate(() => {
      const net = (window as any).__EDITOR_TEST__.getNetwork();
      const p = net.getViewPosition();
      net.moveTo({ position: { x: p.x + 120, y: p.y + 40 }, animation: false });
    });
    await expect.poll(async () => (await shapes()).transform, { timeout: 5000 }).not.toBe(before.transform);
    expect((await shapes()).markup).toBe(before.markup);
  });

  it('disappears when the search is cleared', async () => {
    await search('');
    await expect.poll(shapes, { timeout: 5000 }).toMatchObject({ rects: 0, paths: 0 });
  });
});
