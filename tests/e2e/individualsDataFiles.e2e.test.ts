/**
 * E2E: adding data files several at once, by drag and drop, and compressed (#222, #223), with the example of a run in two parts
 * of gzip-compressed N-Quads (examples/datasets/run-parts). The ontology and the data addresses are answered by routes (no real
 * network); the files are read from the example folder.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { EDITOR_URL } from './editorUrl';
import { traceOnFailure } from './traceOnFailure';

const DIR = join(__dirname, '../../examples/datasets/run-parts');
const VOCABULARY = readFileSync(join(DIR, 'vocabulary.ttl'), 'utf8');
const PART = (n: 1 | 2) => join(DIR, `part-000${n}.nq.gz`);

describe('adding data files: several, dropped, compressed', () => {
  let browser: Browser;
  let page: Page;

  const sources = () => page.locator('[data-data-list] li').allInnerTexts();
  const removeAll = async () => {
    while ((await page.locator('[data-data-remove]').count()) > 0) await page.locator('[data-data-remove]').first().click();
  };

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    const cors = { 'access-control-allow-origin': '*' };
    await page.route((url) => url.hostname === 'e2e-onto.test', (route) => route.fulfill({ status: 200, contentType: 'text/turtle', body: VOCABULARY, headers: cors }));
    // Served as a server like raw.githubusercontent.com serves a .gz: the compressed bytes, with no Content-Encoding.
    await page.route((url) => url.hostname === 'e2e-data.test', (route) =>
      route.fulfill({ status: 200, contentType: 'application/octet-stream', body: readFileSync(join(DIR, new URL(route.request().url()).pathname.slice(1))), headers: cors })
    );
    await page.goto(`${EDITOR_URL}?onto=${encodeURIComponent('https://e2e-onto.test/vocabulary.ttl')}&data=${encodeURIComponent('https://e2e-data.test/part-0001.nq.gz')}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(() => document.getElementById('individualsPanelBtn')?.textContent === 'Individuals (18)');
    await page.click('#individualsPanelBtn');
  });

  afterAll(async () => {
    await browser?.close();
  });
  traceOnFailure(() => page.context());

  it('adds a .gz address named by ?data=, decompressed in the browser and read as N-Quads', async () => {
    expect(await sources()).toEqual([expect.stringContaining('part-0001.nq.gz — 81 triples')]);
  });

  it('adds both parts picked at once, each its own source: 33 individuals of two classes', async () => {
    await removeAll();

    await page.setInputFiles('[data-add-file-input]', [PART(1), PART(2)]);

    await page.waitForFunction(() => document.getElementById('individualsPanelBtn')?.textContent === 'Individuals (33)');
    expect(await sources()).toEqual([expect.stringContaining('part-0001.nq.gz — 81 triples'), expect.stringContaining('part-0002.nq.gz — 74 triples')]);
    expect(await page.locator('[data-individuals-group-toggle] .individuals-group-title').allTextContents()).toEqual(['Reading (30)', 'Sensor (3)']);
    expect(await page.locator('[data-data-status]').innerText()).toBe('');
  });

  it('lists the named graphs of the data by label, and unticking one leaves its individuals out of the list and the count (#224)', async () => {
    await removeAll();
    await page.setInputFiles('[data-add-file-input]', join(DIR, 'run.trig'));
    await page.waitForFunction(() => document.getElementById('individualsPanelBtn')?.textContent === 'Individuals (33)');

    expect(await page.locator('[data-data-graph]').allInnerTexts()).toEqual(['Batch 1 — 82 quads', 'Batch 2 — 75 quads']);
    await page.locator('[data-data-graph]', { hasText: 'Batch 2' }).locator('input').uncheck();

    await page.waitForFunction(() => document.getElementById('individualsPanelBtn')?.textContent === 'Individuals (18)');
    expect(await page.locator('[data-individuals-group-toggle] .individuals-group-title').allTextContents()).toEqual(['Reading (15)', 'Sensor (3)']);
    expect(await page.locator('[data-data-graph]', { hasText: 'Batch 2' }).locator('input').isChecked()).toBe(false);
  });

  it('draws the individuals linked to one when it is double-clicked, and offers to add no node (#239)', async () => {
    await removeAll();
    await page.setInputFiles('[data-add-file-input]', [PART(1), PART(2)]);
    // 33 individuals, more than are drawn by themselves: none is drawn.
    await page.waitForFunction(() => document.getElementById('individualsPanelBtn')?.textContent === 'Individuals (33)');
    await page.click('[data-individuals-group="http://example.org/examples/run-parts#Reading"] [data-individuals-group-toggle]');
    const row = page.locator('[data-individuals-list] li', { has: page.locator('[data-individuals-item][title="http://example.org/examples/run-parts#reading15"]') });
    await row.locator('[data-individuals-show-in-graph]').click();
    const id = '__individual__http://example.org/examples/run-parts#reading15';
    const drawn = () => page.evaluate(() => ((window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.getIds() as string[]).filter((n) => n.startsWith('__individual__')).sort());
    await page.waitForFunction((nodeId) => (window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.get(nodeId) !== null, id);
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.isViewSettled());
    expect(await drawn()).toEqual([id]);
    const before = await page.evaluate((nodeId) => (window as any).__EDITOR_TEST__.getNetwork().getPositions([nodeId])[nodeId] as { x: number; y: number }, id);
    const at = await page.evaluate((nodeId) => {
      const net = (window as any).__EDITOR_TEST__.getNetwork();
      const dom = net.canvasToDOM(net.getPositions([nodeId])[nodeId]);
      const rect = document.getElementById('network')!.getBoundingClientRect();
      return { x: rect.left + dom.x, y: rect.top + dom.y };
    }, id);

    await page.mouse.dblclick(at.x, at.y);

    // Reading 15 follows Reading 14, points to Reading 16, and is made by Sensor 3.
    await page.waitForFunction(() => ((window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.getIds() as string[]).filter((n) => n.startsWith('__individual__')).length === 4);
    expect(await drawn()).toEqual(
      ['reading14', 'reading15', 'reading16', 'sensor3'].map((n) => `__individual__http://example.org/examples/run-parts#${n}`)
    );
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('addNodeModal')!).display)).toBe('none');
    // It stays where it was, and selected, so it is found again after the redraw.
    const after = await page.evaluate((nodeId) => {
      const net = (window as any).__EDITOR_TEST__.getNetwork();
      return { position: net.getPositions([nodeId])[nodeId], selected: net.getSelectedNodes().map(String) };
    }, id);
    expect(after.selected).toEqual([id]);
    // The selection line in the bottom bar follows it (selecting from code raises no select event).
    expect(await page.locator('#info').innerText()).toContain('reading15');
    expect(Math.round(after.position.x)).toBe(Math.round(before.x));
    expect(Math.round(after.position.y)).toBe(Math.round(before.y));
  });

  it('adds a file dropped on the graph while the Individuals tab is open, outlining the graph while it is over it', async () => {
    await removeAll();
    const bytes = [...readFileSync(PART(2))];
    const transfer = await page.evaluateHandle((data) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(data)], 'part-0002.nq.gz'));
      return dt;
    }, bytes);

    await page.dispatchEvent('#networkWrapper', 'dragover', { dataTransfer: transfer });
    expect(await page.locator('#networkWrapper').getAttribute('class')).toContain('data-drop-active');
    await page.dispatchEvent('#networkWrapper', 'drop', { dataTransfer: transfer });

    await page.waitForFunction(() => document.querySelectorAll('[data-data-list] li').length === 1);
    expect(await sources()).toEqual([expect.stringContaining('part-0002.nq.gz — 74 triples')]);
    expect(await page.locator('#networkWrapper').getAttribute('class')).not.toContain('data-drop-active');
  });
});
