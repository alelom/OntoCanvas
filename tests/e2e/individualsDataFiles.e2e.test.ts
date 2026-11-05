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
