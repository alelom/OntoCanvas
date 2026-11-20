/**
 * E2E: a CONSTRUCT result added to the data (#253), with examples/datasets/adiro-promotion: the field kinds are opened as the
 * ontology, the assertions are added as data, the ADIRO promotion rule runs in the Query tab, "Add result to the data" keeps its
 * triples as a graph of their own, and a query for the drawing's title then answers with the accepted value. There is no network.
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
const TITLE_OF_REVISION =
  'PREFIX adm: <https://w3id.org/adiro/adiro_drawing_metadata#> SELECT ?v WHERE { <urn:example:promotion/revision1> adm:drawingTitle ?v }';

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
    await page.setInputFiles('[data-add-file-input]', join(DIR, 'assertions.nq'));
    await page.locator('[data-data-list] li').first().waitFor();
    await page.click('[data-tab-button="query"]');
    await page.locator(EDITOR).waitFor();
  });

  afterAll(async () => {
    await browser?.close();
  });
  traceOnFailure(() => page.context());

  it("previews the rule's two triples and offers to add them; the assertions alone give the drawing no title", async () => {
    await run(TITLE_OF_REVISION);
    await page.waitForFunction(() => /0 rows/.test(document.querySelector('[data-query-status]')?.textContent ?? ''));

    await run(RULE);
    await page.locator('[data-query-add-result]').waitFor();
    expect(await page.textContent('[data-query-status]')).toMatch(/2 triples/);
  });

  it('adds them as a graph of their own, which the Individuals tab lists, and a query then answers with the accepted title', async () => {
    await page.click('[data-query-add-result]');
    await page.waitForFunction(() => /^Added 2 triples to the data, in the graph urn:ontocanvas:result/.test(document.querySelector('[data-query-status]')?.textContent ?? ''));

    await run(TITLE_OF_REVISION);
    await page.locator('.query-results tbody td').first().waitFor();
    expect(await page.locator('.query-results tbody td').allTextContents()).toEqual(['"Ground Floor Plan"']);

    await page.click('[data-tab-button="individuals"]');
    expect(await page.locator('[data-data-graph]').allInnerTexts()).toEqual(['urn:example:promotion:run-1 — 55 quads', 'urn:ontocanvas:result — 2 quads']);
    expect(await page.locator('[data-data-list] > li').allInnerTexts()).toEqual([
      expect.stringContaining('assertions.nq — 55 triples'),
      expect.stringContaining('Query result — 2 triples'),
    ]);
  });

  it('takes the result out again with Remove, leaving the assertions', async () => {
    await page.locator('[data-data-list] > li', { hasText: 'Query result' }).locator('[data-data-remove]').click();

    await page.waitForFunction(() => document.querySelectorAll('[data-data-graph]').length === 1);
    expect(await page.locator('[data-data-list] > li').allInnerTexts()).toEqual([expect.stringContaining('assertions.nq — 55 triples')]);
  });
});
