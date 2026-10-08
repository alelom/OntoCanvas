/**
 * E2E regression for issue #45: a single click on a relationship (edge) LABEL — where the label
 * box is offset from the thin edge line — must select the edge (vis-network only selects on the
 * line, so a custom label hit-test backs this). Previously the click handler read the pointer from
 * the wrong place (params.event.pointer instead of params.pointer.DOM) and selected nothing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { waitForAppReady } from './testHelpers';

const EDITOR_URL = 'http://localhost:5173/';

const TTL = `@prefix : <http://example.org/o#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/o> a owl:Ontology .
:A a owl:Class ; rdfs:label "A" .
:B a owl:Class ; rdfs:label "B" .
:relatesToWithALongName a owl:ObjectProperty ; rdfs:label "relatesToWithALongName" ; rdfs:domain :A ; rdfs:range :B .
`;

describe('Edge label single-click selection E2E', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__?.loadTtlDirectly !== undefined, undefined, { timeout: 5000 });
    await page.evaluate(() => (window as any).__EDITOR_TEST__?.hideOpenOntologyModal?.());
    await page.evaluate((t) => (window as any).__EDITOR_TEST__.loadTtlDirectly(t), TTL);
    await waitForAppReady(page);
    await page.waitForFunction(
      () => {
        const n = (window as any).__EDITOR_TEST__?.getNetwork?.();
        return n && Object.keys(n.body?.edges || {}).length > 0;
      }, undefined,
      { timeout: 5000 }
    );
    // Ensure no modal overlay is intercepting canvas clicks.
    await page.evaluate(() => (window as any).__EDITOR_TEST__?.hideOpenOntologyModal?.());
    await page.keyboard.press('Escape');
    await waitForAppReady(page);
  });

  afterAll(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
  });

  it('selects the edge when its label is clicked off the line', async () => {
    // Compute a point inside the label box but off the (near-vertical) edge line.
    const target = await page.evaluate(() => {
      const net = (window as any).__EDITOR_TEST__.getNetwork();
      const id = Object.keys(net.body.edges)[0];
      const s = net.body.edges[id].labelModule.size;
      const offCanvas = { x: s.left + Math.min(8, s.width * 0.1), y: s.top + s.height / 2 };
      const dom = net.canvasToDOM(offCanvas);
      const rect = document.getElementById('network')!.getBoundingClientRect();
      return {
        id,
        onLine: net.getEdgeAt(dom) ?? null, // null => genuinely off the edge line
        clientX: rect.left + dom.x,
        clientY: rect.top + dom.y,
      };
    });

    // Sanity: the point is off the line, so this only passes via the label hit-test.
    expect(target.onLine).toBeNull();

    await page.mouse.click(target.clientX, target.clientY);

    // Wait for the click to be handled rather than a fixed pause: on a busy CI runner the handler can
    // run later than any fixed delay. A click that misses the label still fails once the poll times out.
    await expect
      .poll(() => page.evaluate(() => (window as any).__EDITOR_TEST__.getSelectedEdges()), { timeout: 5000 })
      .toContain(target.id);
  });
});
