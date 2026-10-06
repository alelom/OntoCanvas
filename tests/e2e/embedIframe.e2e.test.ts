/**
 * Dedicated E2E for OntoCanvas embedded in a REAL <iframe> (embed detected via window.self !== window.top,
 * no ?embed flag). Covers:
 *  - #47 embed behaviours active when framed (menu/legend hidden, Open-in-new-tab shown, left-pan dragView),
 *  - #50 the adaptive Max font size is applied inside the iframe,
 *  - #51 the bottom status bar fills the width and is left-aligned.
 *
 * A host page and the ontology are served via Playwright routing so the iframe is same-origin and
 * storage is not partitioned (CI-reliable).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page, type Frame } from 'playwright';
import { defaultMaxFontSize } from '../../src/ui/fontSizeDefaults';

const ORIGIN = 'http://localhost:5173';
const HOST_URL = `${ORIGIN}/__embed_iframe_host__.html`;
const ONTO_URL = `${ORIGIN}/__embed_repro_onto__.ttl`;
const N_CLASSES = 15;

let TTL =
  `@prefix : <http://example.org/o#> .\n` +
  `@prefix owl: <http://www.w3.org/2002/07/owl#> .\n` +
  `@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n` +
  `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n` +
  `<http://example.org/o> rdf:type owl:Ontology .\n`;
for (let i = 0; i < N_CLASSES; i++) {
  TTL += `:C${i} rdf:type owl:Class ; rdfs:label "C${i}"${i > 0 ? ` ; rdfs:subClassOf :C${i - 1}` : ''} .\n`;
}

const IFRAME_SRC = `${ORIGIN}/?onto=${encodeURIComponent(ONTO_URL)}`;
const HOST_HTML = `<!doctype html><html><body style="margin:0"><iframe id="f" src="${IFRAME_SRC}" style="width:1200px;height:760px;border:0"></iframe></body></html>`;

describe('Embedded in a real iframe E2E', () => {
  let browser: Browser;
  let page: Page;
  let frame: Frame;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.route(HOST_URL, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HOST_HTML }));
    await page.route(ONTO_URL, (r) => r.fulfill({ status: 200, contentType: 'text/turtle', body: TTL }));
    await page.goto(HOST_URL, { waitUntil: 'domcontentloaded' });
    const handle = await page.waitForSelector('#f');
    frame = (await handle.contentFrame())!;
    await frame.waitForFunction(
      () => {
        const nc = document.getElementById('nodeCount')?.textContent ?? '';
        return !!document.getElementById('maxFontSize') && Number(nc) > 0;
      },
      { timeout: 10000 }
    );
    await page.waitForTimeout(500);
  });

  afterAll(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
  });

  it('activates embed mode purely from being framed (no ?embed flag)', async () => {
    const snap = await frame.evaluate(() => {
      const net = (window as any).__EDITOR_TEST__.getNetwork();
      const legend = document.getElementById('edgeColorsLegend');
      const openBtn = document.getElementById('openInNewTab');
      return {
        framed: window.self !== window.top,
        embeddedClass: document.body.classList.contains('ontocanvas-embedded'),
        menuHidden: document.getElementById('app')?.classList.contains('embed-no-menu') ?? false,
        legendHidden: legend ? getComputedStyle(legend).display === 'none' : false,
        openBtnVisible: openBtn ? getComputedStyle(openBtn).display !== 'none' : false,
        dragView: net?.interactionHandler?.options?.dragView ?? net?.options?.interaction?.dragView,
      };
    });
    expect(snap.framed).toBe(true);
    expect(snap.embeddedClass).toBe(true);
    expect(snap.menuHidden).toBe(true);
    expect(snap.legendHidden).toBe(true);
    expect(snap.openBtnVisible).toBe(true);
    expect(snap.dragView).toBe(true);
  });

  it('applies the adaptive Max font size inside the iframe (#50)', async () => {
    const v = await frame.evaluate(() => ({
      maxFont: Number((document.getElementById('maxFontSize') as HTMLInputElement)?.value),
      nodes: Number(document.getElementById('nodeCount')?.textContent),
    }));
    expect(v.nodes).toBe(N_CLASSES);
    // Adaptive: for 15 nodes it must be the computed value (~44), not the old flat 70.
    expect(v.maxFont).toBe(defaultMaxFontSize(N_CLASSES));
    expect(v.maxFont).toBeLessThan(70);
  });

  it('status bar fills the width and is left-aligned (#51)', async () => {
    const s = await frame.evaluate(() => {
      const info = document.getElementById('info')!;
      const cs = getComputedStyle(info);
      const app = document.getElementById('app') ?? document.body;
      return {
        alignSelf: cs.alignSelf,
        textAlign: cs.textAlign,
        infoWidth: info.getBoundingClientRect().width,
        appWidth: app.getBoundingClientRect().width,
      };
    });
    expect(s.alignSelf).toBe('stretch');
    expect(s.textAlign).toBe('left');
    expect(s.infoWidth).toBeGreaterThan(s.appWidth * 0.95);
  });

  it('right-click on a node offers only "Copy URI", which copies the term URI (#68)', async () => {
    const pos = await frame.evaluate(() => {
      const net = (window as any).__EDITOR_TEST__.getNetwork();
      const id = net.body.data.nodes.getIds()[0];
      const dom = net.canvasToDOM(net.getPositions([id])[id]);
      const box = document.querySelector('canvas')!.getBoundingClientRect();
      return { x: box.left + dom.x, y: box.top + dom.y, id: String(id) };
    });
    const frameBox = (await (await page.$('#f'))!.boundingBox())!;
    await page.mouse.click(frameBox.x + pos.x, frameBox.y + pos.y, { button: 'right' });
    const items = await frame.evaluate(() =>
      [...document.getElementById('contextMenu')!.children].map((c) => c.textContent ?? '').filter(Boolean)
    );
    expect(items).toEqual(['Copy URI']);
    await frame.click('#contextMenu >> text=Copy URI');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(`http://example.org/o#${pos.id}`);
  });
});
