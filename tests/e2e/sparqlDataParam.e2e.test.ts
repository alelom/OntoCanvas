/**
 * E2E: ?data=<url> next to ?onto=<url> adds the data file to the ontology at start-up (#205), so a link can open an ontology
 * together with its data. The panel opens on the Query tab, whose line says what is queried (#211); the Individuals tab lists
 * the files. The addresses are answered by routes (no real network), the data as text/plain, as raw.githubusercontent.com
 * serves a .ttl.
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
const SUMMARY = '[data-query-data-summary]';

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
    const cors = { 'access-control-allow-origin': '*' };
    await page.route(/e2e-onto\.test\/o\.ttl/, (route) => route.fulfill({ status: 200, contentType: 'text/turtle', body: ONTOLOGY, headers: cors }));
    await page.route(/e2e-data\.test\/people\.ttl/, (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: DATA, headers: cors }));
    await page.route(/e2e-data\.test\/missing\.ttl/, (route) => route.fulfill({ status: 404, body: 'no', headers: cors }));
    await page.goto(`${EDITOR_URL}?${params}`, { waitUntil: 'domcontentloaded' });
  }

  it('opens the ontology and the panel, the Query tab saying the data is queried and the button counting the individuals', async () => {
    await openWith(`onto=${encodeURIComponent('https://e2e-onto.test/o.ttl')}&data=${encodeURIComponent('https://e2e-data.test/people.ttl')}`);

    await page.waitForFunction((sel) => /Querying the ontology and 1 data file/.test(document.querySelector(sel)?.textContent ?? ''), SUMMARY);
    expect(await page.locator('#sidePanel').isVisible()).toBe(true);
    expect(await page.locator('#queryPanelBtn').getAttribute('aria-pressed')).toBe('true');
    expect(await page.locator('#individualsPanelBtn').innerText()).toBe('Individuals (2)');

    await page.locator(EDITOR).fill(
      'PREFIX : <http://example.org/o#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> SELECT ?p WHERE { ?p a ?c . ?c rdfs:subClassOf* :Student } ORDER BY ?p'
    );
    await page.click('[data-query-run]');
    await page.locator('.query-results tbody tr').first().waitFor();
    expect(await page.locator('.query-results tbody td').allTextContents()).toEqual([':alice']);

    // The Individuals tab lists the file that was added.
    await page.click('[data-tab-button="individuals"]');
    expect(await page.locator('[data-data-list] li').first().innerText()).toContain('people.ttl');
    expect(await page.locator('[data-data-list] li').first().innerText()).toContain('2 triples');

    // The link still names it, so it can be shared again.
    expect(new URL(page.url()).searchParams.getAll('data')).toEqual(['https://e2e-data.test/people.ttl']);
    await page.close();
  });

  it('shows why a data file could not be added in the Query tab, and keeps the ontology and the other data', async () => {
    await openWith(
      `onto=${encodeURIComponent('https://e2e-onto.test/o.ttl')}&data=${encodeURIComponent('https://e2e-data.test/missing.ttl')}&data=${encodeURIComponent('https://e2e-data.test/people.ttl')}`
    );

    await page.waitForFunction((sel) => /missing\.ttl.*404/.test(document.querySelector(sel)?.textContent ?? ''), SUMMARY);
    expect(await page.locator(SUMMARY).innerText()).toContain('Querying the ontology and 1 data file');
    await page.click('[data-tab-button="individuals"]');
    expect(await page.locator('[data-data-list] li').count()).toBe(1);
    await page.close();
  });

  it('does nothing about data when no data is named: the panel stays closed, and the button invites adding individuals', async () => {
    await openWith(`onto=${encodeURIComponent('https://e2e-onto.test/o.ttl')}`);

    await page.waitForFunction(() => (window as any).__EDITOR_TEST__?.getNodeIds?.().length === 2);
    expect(await page.locator('#sidePanel').isHidden()).toBe(true);
    expect(await page.locator('#individualsPanelBtn').innerText()).toBe('Add individuals');
    await page.close();
  });
});
