/**
 * E2E for issue #47: embedded mode (?embed / iframe) is a compact, read-only view.
 * - "Edges" legend hidden; "Open in a new tab" button shown.
 * - Left-button panning enabled (dragView); no create-node modal on empty-canvas double-click.
 * - Non-embedded mode keeps the legend, no extra button, editing works.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const TTL = `@prefix : <http://example.org/o#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/o> a owl:Ontology .
:A a owl:Class ; rdfs:label "A" .
:B a owl:Class ; rdfs:label "B" .
:rel a owl:ObjectProperty ; rdfs:label "rel" ; rdfs:domain :A ; rdfs:range :B .
`;

async function open(browser: Browser, url: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.setDefaultTimeout(5000);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await page.waitForFunction(() => (window as any).__EDITOR_TEST__?.loadTtlDirectly !== undefined, undefined, { timeout: 5000 });
  await page.evaluate(() => (window as any).__EDITOR_TEST__?.hideOpenOntologyModal?.());
  await page.evaluate((t) => (window as any).__EDITOR_TEST__.loadTtlDirectly(t), TTL);
  await page.waitForFunction(
    () => {
      const n = (window as any).__EDITOR_TEST__?.getNetwork?.();
      return n && Object.keys(n.body?.edges || {}).length > 0;
    }, undefined,
    { timeout: 5000 }
  );
  await page.evaluate(() => (window as any).__EDITOR_TEST__?.hideOpenOntologyModal?.());
  await page.waitForTimeout(400);
  return page;
}

function snapshot(page: Page) {
  return page.evaluate(() => {
    const net = (window as any).__EDITOR_TEST__.getNetwork();
    const openBtn = document.getElementById('openInNewTab');
    const legend = document.getElementById('edgeColorsLegend');
    return {
      embeddedClass: document.body.classList.contains('ontocanvas-embedded'),
      openBtnVisible: openBtn ? getComputedStyle(openBtn).display !== 'none' : false,
      legendHidden: legend ? getComputedStyle(legend).display === 'none' : false,
      dragView: net?.body?.container ? net.interactionHandler?.options?.dragView ?? net.options?.interaction?.dragView : undefined,
    };
  });
}

describe('Embedded mode E2E', () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });
  afterAll(async () => {
    if (browser) await browser.close();
  });

  it('is compact and read-only with ?embed=1', async () => {
    const page = await open(browser, 'http://localhost:5173/?embed=1');
    const snap = await snapshot(page);
    expect(snap.embeddedClass).toBe(true);
    expect(snap.openBtnVisible).toBe(true);
    expect(snap.legendHidden).toBe(true);
    expect(snap.dragView).toBe(true);

    // Double-clicking empty canvas must NOT open the create-node modal.
    await page.mouse.dblclick(250, 250);
    await page.waitForTimeout(200);
    const addModalShown = await page.evaluate(() => {
      const m = document.getElementById('addNodeModal');
      return m ? getComputedStyle(m).display !== 'none' : false;
    });
    expect(addModalShown).toBe(false);
    await page.close();
  });

  it('keeps the legend, hides the button, and allows editing when not embedded', async () => {
    const page = await open(browser, 'http://localhost:5173/');
    const snap = await snapshot(page);
    expect(snap.embeddedClass).toBe(false);
    expect(snap.openBtnVisible).toBe(false);
    expect(snap.legendHidden).toBe(false);
    expect(snap.dragView).toBe(false);

    await page.mouse.dblclick(250, 250);
    await page.waitForTimeout(200);
    const addModalShown = await page.evaluate(() => {
      const m = document.getElementById('addNodeModal');
      return m ? getComputedStyle(m).display !== 'none' : false;
    });
    expect(addModalShown).toBe(true);
    await page.close();
  });
});
