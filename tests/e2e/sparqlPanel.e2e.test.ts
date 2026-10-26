/**
 * E2E: the SPARQL side panel in the built app (#171). The pure parts are unit-tested; this covers what only the
 * page can show: the panel takes room from the graph and gives it back, opening it loads nothing, Run loads the
 * engine and fills the table.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { openEditorWithTtl } from './testHelpers';

const TTL = `
@prefix : <http://example.org/o#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/o> a owl:Ontology .
:Person a owl:Class ; rdfs:label "Person" .
:Student a owl:Class ; rdfs:label "Student"@en ; rdfs:subClassOf :Person .
`;
const isEngineRequest = (u: string) => /index-browser|comunica|runQuery/i.test(u);

describe('SPARQL side panel', () => {
  let browser: Browser;
  let page: Page;
  const requested: string[] = [];

  const networkWidth = () => page.evaluate(() => document.getElementById('networkWrapper')!.getBoundingClientRect().width);

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    page.on('request', (req) => requested.push(req.url()));
    await openEditorWithTtl(page, TTL);
  });

  afterAll(async () => {
    await browser?.close();
  });

  it('is closed at first, and opening it takes room from the graph without loading the engine', async () => {
    expect(await page.locator('#sidePanel').isHidden()).toBe(true);
    // The toolbar is full: one more button there wraps it (at 1200px it grew by over 100px and pushed the graph down).
    expect(await page.locator('#controls #queryPanelBtn').count()).toBe(0);
    const before = await networkWidth();

    await page.click('#queryPanelBtn');
    await page.locator('#sidePanel').waitFor({ state: 'visible' });

    await page.waitForFunction((w) => document.getElementById('networkWrapper')!.getBoundingClientRect().width < w, before);
    expect(requested.filter(isEngineRequest)).toEqual([]);
  });

  it('starts with the file\'s prefixes, runs the query and shows the classes as prefixed names', async () => {
    expect(await page.inputValue('[data-query-editor]')).toContain('PREFIX : <http://example.org/o#>');
    await page.fill(
      '[data-query-editor]',
      'PREFIX : <http://example.org/o#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> ' +
        'SELECT ?c ?l WHERE { ?c rdfs:label ?l } ORDER BY ?c'
    );

    await page.click('[data-query-run]');
    await page.locator('.query-results tbody tr').first().waitFor();

    expect(await page.locator('.query-results th').allTextContents()).toEqual(['?c', '?l']);
    expect(await page.locator('.query-results tbody td').allTextContents()).toEqual([':Person', '"Person"', ':Student', '"Student"@en']);
    expect(await page.textContent('[data-query-status]')).toMatch(/2 rows/);
    expect(requested.some(isEngineRequest)).toBe(true);
  });

  it('shows the error of an update query instead of running it', async () => {
    await page.fill('[data-query-editor]', 'DELETE WHERE { ?s ?p ?o }');
    await page.click('[data-query-run]');

    expect(await page.locator('[data-query-error]').textContent()).toMatch(/read-only/i);
  });

  it('closes, giving the room back to the graph', async () => {
    const open = await networkWidth();

    await page.click('[data-side-panel-close]');

    await page.waitForFunction((w) => document.getElementById('networkWrapper')!.getBoundingClientRect().width > w, open);
    expect(await page.locator('#sidePanel').isHidden()).toBe(true);
  });
});
