/**
 * E2E: a CONSTRUCT result added to the data (#253), with examples/datasets/adiro-promotion: the fields' ontology is opened, the
 * readings are added as data, the promotion rule runs in the Query tab, "Add result to the data" keeps its triples as a graph
 * of their own, and a query for a drawing's field then answers with the accepted value. There is no network.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { EDITOR_URL } from './editorUrl';
import { loadTestFile } from './testHelpers';
import { traceOnFailure } from './traceOnFailure';

const DIR = join(__dirname, '../../examples/datasets/adiro-promotion');
const RULE = readFileSync(join(DIR, 'promotion.rq'), 'utf8');
const EDITOR = '[data-query-editor][data-editor="codemirror"] .cm-content';

describe('adding a CONSTRUCT result to the data', () => {
  let browser: Browser;
  let page: Page;

  const run = async (query: string): Promise<void> => {
    await page.locator(EDITOR).fill(query);
    await page.click('[data-query-run]');
  };

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined);
    await loadTestFile(page, join(DIR, 'fields.ttl'));
    await page.click('#queryPanelBtn');
    await page.click('[data-tab-button="individuals"]');
    await page.setInputFiles('[data-add-file-input]', join(DIR, 'readings.nq'));
    await page.locator('[data-data-list] li').first().waitFor();
    await page.click('[data-tab-button="query"]');
    await page.locator(EDITOR).waitFor();
  });

  afterAll(async () => {
    await browser?.close();
  });
  traceOnFailure(() => page.context());

  it('previews the rule\'s triples and offers to add them; the readings alone have no accepted value', async () => {
    await run('PREFIX ex: <http://example.org/promotion#> SELECT ?v WHERE { ex:d1 ex:drawingNumber ?v }');
    await page.waitForFunction(() => /0 rows/.test(document.querySelector('[data-query-status]')?.textContent ?? ''));

    await run(RULE);
    await page.locator('[data-query-add-result]').waitFor();
    expect(await page.textContent('[data-query-status]')).toMatch(/6 triples/);
  });

  it('adds them as a graph of their own, which the Individuals tab lists, and a query then answers with the accepted value', async () => {
    await page.click('[data-query-add-result]');
    await page.waitForFunction(() => /^Added 6 triples to the data, in the graph urn:ontocanvas:result/.test(document.querySelector('[data-query-status]')?.textContent ?? ''));

    await run('PREFIX ex: <http://example.org/promotion#> SELECT ?v WHERE { ex:d1 ex:drawingNumber ?v }');
    await page.locator('.query-results tbody td').first().waitFor();
    expect(await page.locator('.query-results tbody td').allTextContents()).toEqual(['"A-101"']);

    await page.click('[data-tab-button="individuals"]');
    expect(await page.locator('[data-data-graph]').allInnerTexts()).toEqual(['urn:example:promotion:run-1 — 22 quads', 'urn:ontocanvas:result — 6 quads']);
    expect(await page.locator('[data-data-list] > li').allInnerTexts()).toEqual([
      expect.stringContaining('readings.nq — 22 triples'),
      expect.stringContaining('Query result — 6 triples'),
    ]);
  });

  it('takes the result out again with Remove, leaving the readings', async () => {
    await page.locator('[data-data-list] > li', { hasText: 'Query result' }).locator('[data-data-remove]').click();

    await page.waitForFunction(() => document.querySelectorAll('[data-data-graph]').length === 1);
    expect(await page.locator('[data-data-list] > li').allInnerTexts()).toEqual([expect.stringContaining('readings.nq — 22 triples')]);
  });
});
