/**
 * E2E: ?data=<url> next to ?onto=<url> adds the data file to the ontology at start-up (#205), so a link can open an ontology
 * together with its data. The addresses are answered by routes (no real network), the data as text/plain, as
 * raw.githubusercontent.com serves a .ttl.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { EDITOR_URL } from './editorUrl';

const ONTOLOGY = `
@prefix : <http://example.org/o#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/o> a owl:Ontology .
:Person a owl:Class ; rdfs:label "Person" .
:Student a owl:Class ; rdfs:label "Student" ; rdfs:subClassOf :Person .
`;
const DATA = '@prefix : <http://example.org/o#> .\n:alice a :Student .\n:bob a :Person .\n';
const EDITOR = '[data-query-editor][data-editor="codemirror"] .cm-content';

describe('?data= at start-up', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await launchBrowser();
  });

  afterAll(async () => {
    await browser?.close();
  });

  async function openWith(params: string): Promise<void> {
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    await page.route(/e2e-onto\.test\/o\.ttl/, (route) => route.fulfill({ status: 200, contentType: 'text/turtle', body: ONTOLOGY, headers: { 'access-control-allow-origin': '*' } }));
    await page.route(/e2e-data\.test\/people\.ttl/, (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: DATA, headers: { 'access-control-allow-origin': '*' } }));
    await page.route(/e2e-data\.test\/missing\.ttl/, (route) => route.fulfill({ status: 404, body: 'no', headers: { 'access-control-allow-origin': '*' } }));
    await page.goto(`${EDITOR_URL}?${params}`, { waitUntil: 'domcontentloaded' });
  }

  it('opens the ontology, shows the panel with the data added, and queries them together', async () => {
    await openWith(`onto=${encodeURIComponent('https://e2e-onto.test/o.ttl')}&data=${encodeURIComponent('https://e2e-data.test/people.ttl')}`);

    await page.locator('[data-data-list] li').waitFor();
    expect(await page.locator('#sidePanel').isVisible()).toBe(true);
    expect(await page.locator('[data-data-list] li').first().innerText()).toContain('people.ttl');
    expect(await page.locator('[data-data-list] li').first().innerText()).toContain('2 triples');

    await page.locator(EDITOR).fill(
      'PREFIX : <http://example.org/o#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> SELECT ?p WHERE { ?p a ?c . ?c rdfs:subClassOf* :Student } ORDER BY ?p'
    );
    await page.click('[data-query-run]');
    await page.locator('.query-results tbody tr').first().waitFor();
    expect(await page.locator('.query-results tbody td').allTextContents()).toEqual([':alice']);

    // The link still names both, so it can be shared again.
    expect(new URL(page.url()).searchParams.getAll('data')).toEqual(['https://e2e-data.test/people.ttl']);
    await page.close();
  });

  it('shows why a data file could not be added, and keeps the ontology and the other data', async () => {
    await openWith(
      `onto=${encodeURIComponent('https://e2e-onto.test/o.ttl')}&data=${encodeURIComponent('https://e2e-data.test/missing.ttl')}&data=${encodeURIComponent('https://e2e-data.test/people.ttl')}`
    );
    await page.locator('[data-data-list] li').waitFor();
    expect(await page.locator('[data-data-list] li').count()).toBe(1);
    await page.waitForFunction(() => /missing\.ttl.*404/.test(document.querySelector('[data-data-status]')?.textContent ?? ''));
    await page.close();
  });

  it('does nothing about data when no ontology is named, and the address without ?data= opens as before', async () => {
    await openWith(`onto=${encodeURIComponent('https://e2e-onto.test/o.ttl')}`);

    await page.waitForFunction(() => (window as any).__EDITOR_TEST__?.getNodeIds?.().length === 2);
    expect(await page.locator('#sidePanel').isHidden()).toBe(true);
    await page.close();
  });
});
