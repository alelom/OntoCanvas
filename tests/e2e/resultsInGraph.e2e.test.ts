/**
 * E2E: a query result shown in the graph (#207), on the readings example. After a Run the readings the result names are
 * outlined, nothing selected; with the individuals cleared, "Select in graph" draws and selects them; a CONSTRUCT result is
 * shown by its triples; the SHACL report shows a shape's focus nodes. The addresses are answered by routes from the example's
 * files (no real network).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { EDITOR_URL } from './editorUrl';

const EXAMPLE = join(__dirname, '../../examples/checks');
const SITE = 'https://e2e-results.test/checks/';
const EDITOR = '[data-query-editor][data-editor="codemirror"] .cm-content';
const PREFIX = 'PREFIX : <http://example.org/examples/readings#>\n';
const UNREAD = `${PREFIX}SELECT ?reading WHERE { ?reading a :TextReading . FILTER NOT EXISTS { ?reading :readText ?text } } ORDER BY ?reading`;

describe('a query result shown in the graph', () => {
  let browser: Browser;
  let page: Page;

  const individuals = () =>
    page.evaluate(() =>
      ((window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.getIds() as string[])
        .map(String)
        .filter((id) => id.startsWith('__individual__'))
        .map((id) => id.split('#')[1])
        .sort()
    );
  async function run(query: string): Promise<void> {
    await page.locator(EDITOR).fill(query);
    await page.click('[data-query-run]');
    await page.waitForFunction(() => /\d+ ms/.test(document.querySelector('[data-query-status]')?.textContent ?? ''));
  }

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    await page.route(/e2e-results\.test\/checks\//, (route) => {
      const path = new URL(route.request().url()).pathname.replace('/checks/', '');
      try {
        route.fulfill({ status: 200, contentType: 'text/plain', body: readFileSync(join(EXAMPLE, path), 'utf8'), headers: { 'access-control-allow-origin': '*' } });
      } catch {
        route.fulfill({ status: 404, body: '' });
      }
    });
    const at = (file: string) => encodeURIComponent(SITE + file);
    await page.goto(`${EDITOR_URL}?onto=${at('readings.ttl')}&data=${at('readings-data.ttl')}&checks=${at('manifest.json')}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-checks-shapes-file]');
    await page.waitForFunction(() => ((window as any).__EDITOR_TEST__.getNetwork()?.body.data.nodes.getIds() ?? []).some((id: string) => String(id).startsWith('__individual__')));
    await page.click('#queryPanelBtn');
    await page.waitForSelector(EDITOR);
  });

  afterAll(async () => {
    await browser?.close();
  });

  it('outlines the readings a result names after a Run, selecting nothing', async () => {
    await run(UNREAD);

    expect(await page.locator('[data-query-shown]').innerText()).toBe('3 individuals outlined in the graph. Clear');
    await page.waitForFunction(() => document.querySelectorAll('#resultOutlineOverlay .oc-mark').length === 3);
    expect(await page.evaluate(() => (window as any).__EDITOR_TEST__.getNetwork().getSelectedNodes().length)).toBe(0);

    await page.click('[data-query-shown-clear]');
    await page.waitForFunction(() => document.querySelectorAll('#resultOutlineOverlay .oc-mark').length === 0);
  });

  it('draws and selects the individuals of a result when none is drawn', async () => {
    await page.click('#individualsPanelBtn');
    await page.click('[data-individuals-clear]');
    await page.waitForFunction(() => !(window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.getIds().some((id: string) => String(id).startsWith('__individual__')));
    await page.click('#queryPanelBtn');

    await run(UNREAD);
    expect(await page.locator('[data-query-show-in-graph]').innerText()).toBe('Select in graph (draws 3 individuals)');
    await page.click('[data-query-show-in-graph]');

    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.getNetwork().getSelectedNodes().length === 3);
    expect(await individuals()).toEqual(['reading2', 'reading4', 'reading6']);
  });

  it('shows a CONSTRUCT result by its triples', async () => {
    await run(`${PREFIX}CONSTRUCT { ?r :isReadingOf ?g } WHERE { ?r :isReadingOf ?g ; :hasOutcome ?o }`);

    expect(await page.locator('[data-query-status]').innerText()).toMatch(/^3 triples in \d+ ms; \d of 3 (is|are) in the graph$/);
    expect(await page.locator('[data-query-show-in-graph]').innerText()).toMatch(/^Select in graph \(/);
  });

  it('shows the focus nodes of a SHACL shape in the graph', async () => {
    await page.click('#checksPanelBtn');
    await page.click('[data-checks-run]');
    await page.waitForFunction(() => /checked in/.test(document.querySelector('[data-checks-status]')?.textContent ?? ''));

    await page.locator('[data-checks-shape]', { hasText: 'TextOrOutcome' }).locator('[data-checks-show-in-graph]').click();

    await page.waitForFunction(() => document.querySelectorAll('#resultOutlineOverlay .oc-mark').length === 2);
    expect(await individuals()).toEqual(expect.arrayContaining(['reading3', 'reading4']));
  });
});
