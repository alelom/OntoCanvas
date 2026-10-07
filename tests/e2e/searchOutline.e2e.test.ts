/**
 * E2E for #84: the search draws a pulsing outline (SVG overlay) around what it matched directly — a
 * class, a data-property box, or a relationship's curve — follows pans, and disappears when cleared.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const EDITOR_URL = 'http://localhost:5173/';

const TTL = `@prefix : <http://example.org/main#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<http://example.org/main> a owl:Ontology .
:Group a owl:Class ; rdfs:label "Group" .
:Agent a owl:Class ; rdfs:label "Agent" .
:member a owl:ObjectProperty ; rdfs:label "member" ; rdfs:domain :Group ; rdfs:range :Agent .
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
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__?.loadTtlDirectly !== undefined, { timeout: 5000 });
    await page.evaluate(() => (window as any).__EDITOR_TEST__?.hideOpenOntologyModal?.());
    await page.evaluate((t) => (window as any).__EDITOR_TEST__.loadTtlDirectly(t), TTL);
    await page.waitForFunction(() => ((window as any).__EDITOR_TEST__?.getRawDataEdges?.() ?? []).length > 0, { timeout: 5000 });
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

  it('outlines a matched data property box', async () => {
    await search('yahooChatID'); // "Exact match" is on by default
    await expect.poll(shapes, { timeout: 5000 }).toMatchObject({ rects: 1, paths: 0 });
  });

  it('follows a pan by moving the group only (shapes unchanged)', async () => {
    // Let any view animation started by the search settle first, or it would undo the pan.
    const viewNow = () => page.evaluate(() => JSON.stringify((window as any).__EDITOR_TEST__.getNetwork().getViewPosition()));
    await expect
      .poll(async () => {
        const a = await viewNow();
        await page.waitForTimeout(150);
        return a === (await viewNow());
      }, { timeout: 5000 })
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
