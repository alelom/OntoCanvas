/**
 * E2E: the ontologies the data was made with (#236), and the individuals named by them (#235). Data opened on its own names
 * an ontology version (prov:used); it is read on its own (#239), the bottom bar says so, and its class then names the
 * individuals and their class node. The ontology's address is answered by a route (no network), held until a test lets it
 * answer, so what is shown before it is read can be seen.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { EDITOR_URL } from './editorUrl';
import { traceOnFailure } from './traceOnFailure';

const ONTOLOGY = `@prefix owl: <http://www.w3.org/2002/07/owl#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<https://e2e-onto.test/o> a owl:Ontology ; owl:versionIRI <https://e2e-onto.test/o/1.0> .
<http://example.org/o#Assertion> a owl:Class ; rdfs:label "Field assertion" .
`;
const T = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const DATA = [
  `<urn:run:1> <${T}> <http://www.w3.org/ns/prov#Activity> <urn:run:1> .`,
  `<urn:run:1> <http://www.w3.org/ns/prov#used> <https://e2e-onto.test/o/1.0> <urn:run:1> .`,
  `<urn:run:1/a1> <${T}> <http://example.org/o#Assertion> <urn:run:1> .`,
  `<urn:run:1/a2> <${T}> <http://example.org/o#Assertion> <urn:run:1> .`,
].join('\n') + '\n';

describe('the ontologies the data was made with', () => {
  let browser: Browser;
  let page: Page;
  let letAnswer!: () => void;
  const answer = new Promise<void>((resolve) => (letAnswer = resolve));
  const groups = () => page.locator('[data-individuals-group-toggle] .individuals-group-title').allTextContents();
  const classNodeLabels = () =>
    page.evaluate(() =>
      ((window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.get() as Array<{ id: string; label: string }>)
        .filter((n) => String(n.id).startsWith('__individual_class__'))
        .map((n) => n.label)
    );

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    await page.route((url) => url.hostname === 'e2e-onto.test', async (route) => {
      await answer;
      await route.fulfill({ status: 200, contentType: 'text/turtle', body: ONTOLOGY, headers: { 'access-control-allow-origin': '*' } });
    });
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('#openOntologyModal [data-explore-data]').waitFor({ state: 'visible' });
    await page.setInputFiles('#openOntologyModal [data-explore-data-input]', { name: 'run.nq', mimeType: 'application/n-quads', buffer: Buffer.from(DATA) });
    await page.waitForFunction(() => document.querySelectorAll('[data-data-list] li').length === 1);
  });

  afterAll(async () => {
    await browser?.close();
  });
  traceOnFailure(() => page.context());

  it('names the classes by their local name, and draws them as dashed nodes with their counts, while no ontology declares them', async () => {
    expect(await groups()).toEqual(['Assertion (2)', 'Activity (1)']);
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.isViewSettled());
    expect(await classNodeLabels()).toContain('Assertion');
  });

  it('asks nothing: the Individuals tab has no offer to open it (#239)', async () => {
    expect(await page.locator('[data-data-ontologies]').count()).toBe(0);
  });

  it('reads it on its own, says so in the bottom bar, and its label names the individuals and their class node, "defined by" it (#235)', async () => {
    letAnswer();

    await page.waitForFunction(() =>
      /Read as context: o 1\.0/.test(document.querySelector('#ontologyIssuesPopup [data-status-notice="data-ontologies"]')?.textContent ?? '')
    );
    await page.waitForFunction(() => document.querySelector('[data-individuals-group-toggle] .individuals-group-title')?.textContent === 'Field assertion (2)');
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.isViewSettled());
    expect(await classNodeLabels()).toContain('(defined by: o)\nField assertion');
  });
});
