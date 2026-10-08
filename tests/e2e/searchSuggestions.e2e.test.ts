/**
 * E2E for #81: the search bar suggests relationships, classes and data properties by prefixed name
 * (foaf:member, not http://xmlns.com/foaf/0.1/member), with the full IRI as a tooltip; choosing one puts
 * that name in the search box; ontology labels are shown as text, never interpreted as HTML.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { waitForAppReady } from './testHelpers';

const EDITOR_URL = 'http://localhost:5173/';

const TTL = `@prefix : <http://example.org/main#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<http://example.org/main> a owl:Ontology .
foaf:Group a owl:Class ; rdfs:label "Group" .
foaf:Agent a owl:Class ; rdfs:label "Agent" .
:Tagged a owl:Class ; rdfs:label "<b>Bold</b> tag" .
foaf:member a owl:ObjectProperty ; rdfs:label "member" ; rdfs:domain foaf:Group ; rdfs:range foaf:Agent .
foaf:yahooChatID a owl:DatatypeProperty ; rdfs:label "Yahoo chat ID" ; rdfs:domain foaf:Agent ; rdfs:range xsd:string .
`;

describe('Search suggestions E2E (#81)', () => {
  let browser: Browser;
  let page: Page;

  const suggestions = () =>
    page.$$eval('#searchAutocomplete .suggestion', (els) => els.map((e) => ({ text: e.textContent, title: e.getAttribute('title') })));

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__?.loadTtlDirectly !== undefined, undefined, { timeout: 5000 });
    await page.evaluate(() => (window as any).__EDITOR_TEST__?.hideOpenOntologyModal?.());
    await page.evaluate((t) => (window as any).__EDITOR_TEST__.loadTtlDirectly(t), TTL);
    await waitForAppReady(page);
    await page.waitForFunction(() => ((window as any).__EDITOR_TEST__?.getRawDataEdges?.() ?? []).length > 0, undefined, { timeout: 5000 });
    await page.evaluate(() => (window as any).__EDITOR_TEST__?.hideOpenOntologyModal?.());
    await page.keyboard.press('Escape');
  });

  afterAll(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
  });

  it('suggests a relationship by prefixed name, with the full IRI as tooltip', async () => {
    await page.fill('#searchQuery', 'member');
    await expect.poll(suggestions).toContainEqual({ text: 'foaf:member(relationship)', title: 'http://xmlns.com/foaf/0.1/member' });
  });

  it('suggests data properties, by label too', async () => {
    await page.fill('#searchQuery', 'chat id');
    await expect.poll(suggestions).toContainEqual({ text: 'foaf:yahooChatID(data property)', title: 'http://xmlns.com/foaf/0.1/yahooChatID' });
  });

  it('choosing a suggestion puts its name in the search box', async () => {
    await page.click('#searchAutocomplete .suggestion');
    await expect.poll(() => page.inputValue('#searchQuery')).toBe('foaf:yahooChatID');
  });

  it('shows ontology labels as text, not HTML', async () => {
    await page.fill('#searchQuery', 'bold');
    await expect.poll(suggestions).toContainEqual({ text: '<b>Bold</b> tag(class)', title: 'Tagged' });
    expect(await page.$$eval('#searchAutocomplete b', (els) => els.length)).toBe(0);
  });
});

/** Referenced external classes (drawn, but not part of the ontology's own classes) are suggested too:
 * the dropdown offers what the canvas shows, e.g. skos:Concept in FOAF. */
describe('Search suggestions for referenced external classes E2E (#81)', () => {
  let browser: Browser;
  let page: Page;
  const EXT_TTL = `@prefix : <http://example.org/main#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/main> a owl:Ontology .
:Theme a owl:Class ; rdfs:label "Theme" ; rdfs:subClassOf skos:Concept .
`;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__?.loadTtlDirectly !== undefined, undefined, { timeout: 5000 });
    await page.evaluate(() => (window as any).__EDITOR_TEST__?.hideOpenOntologyModal?.());
    await page.evaluate((t) => (window as any).__EDITOR_TEST__.loadTtlDirectly(t), EXT_TTL);
    await waitForAppReady(page);
    await page.waitForFunction(() => /Nodes: [1-9]/.test(document.body.innerText), undefined, { timeout: 5000 });
    await page.evaluate(() => (window as any).__EDITOR_TEST__?.hideOpenOntologyModal?.());
    await page.keyboard.press('Escape');
  });

  afterAll(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
  });

  it('suggests a referenced external class from a partial prefixed name', async () => {
    const drawn = await page.evaluate(() => Object.keys((window as any).__EDITOR_TEST__.getNetwork().body.nodes));
    expect(drawn).toContain('http://www.w3.org/2004/02/skos/core#Concept'); // precondition: it is on the canvas
    for (const q of ['skos:Co', 'Concept']) {
      await page.fill('#searchQuery', q);
      await expect
        .poll(() => page.$$eval('#searchAutocomplete .suggestion', (els) => els.map((e) => e.textContent)))
        .toContain('skos:Concept(class)');
    }
  });
});
