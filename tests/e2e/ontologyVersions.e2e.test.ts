/**
 * The versions of the open ontology (#132, #133), end to end: an ontology served from GitHub is opened at tag
 * v1.0.0; its other tags are found in the background, the bottom bar says v2.0.0 is newer, and choosing it
 * from the list opens it. GitHub is answered by routes, so the test needs no network.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { waitForAppReady } from './testHelpers';

const raw = (tag: string) => `https://raw.githubusercontent.com/acme/onto/${tag}/onto.ttl`;
const TAGS_API = 'https://api.github.com/repos/acme/onto/tags?per_page=100';
const ontology = (version: string, extraClass: string) => `@prefix : <http://example.org/versioned#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/versioned> rdf:type owl:Ontology ; rdfs:label "Versioned" ;
    owl:versionIRI <http://example.org/versioned/${version}> ; owl:versionInfo "${version}" .
:A rdf:type owl:Class ; rdfs:label "A" .
:${extraClass} rdf:type owl:Class ; rdfs:label "${extraClass}" .
`;
const CORS = { 'access-control-allow-origin': '*' };

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await launchBrowser();
});
afterAll(async () => {
  await browser.close();
});
beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(5000);
  const files: Record<string, string> = { [raw('v1.0.0')]: ontology('1.0.0', 'B'), [raw('v2.0.0')]: ontology('2.0.0', 'C') };
  await page.route('https://raw.githubusercontent.com/**', (route) => {
    const body = files[route.request().url()];
    return body === undefined
      ? route.fulfill({ status: 404, headers: CORS, body: '' })
      : route.fulfill({ status: 200, contentType: 'text/turtle', headers: CORS, body });
  });
  await page.route(TAGS_API, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ name: 'v2.0.0' }, { name: 'v1.0.0' }, { name: 'v0.1.0' }]) })
  );
});
afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

describe('versions of the open ontology (#132, #133)', () => {
  it('says a newer GitHub tag exists, lists the versions, and opens the one chosen', async () => {
    await page.goto(`http://localhost:5173/?onto=${encodeURIComponent(raw('v1.0.0'))}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await waitForAppReady(page);
    const button = page.locator('#ontologyVersionsBtn');
    await expect.poll(() => button.textContent(), { timeout: 5000 }).toBe('v2.0.0 available ▾');

    await button.click();
    // v0.1.0 has no onto.ttl, so it is not listed.
    expect(await page.locator('#ontologyVersionsList [data-version]').allTextContents()).toEqual(['v2.0.0 · GitHub tag', '✓ 1.0.0 · open now']);

    await page.locator('#ontologyVersionsList [data-version="v2.0.0"]').click();
    await expect
      .poll(() => page.evaluate(() => document.getElementById('ontologyVersion')?.textContent), { timeout: 5000 })
      .toBe('v2.0.0');
    await waitForAppReady(page);
    const nodes = await page.evaluate(() => (window as any).__EDITOR_TEST__.getNetwork().body.nodeIndices.map(String).sort());
    expect(nodes).toEqual(['A', 'C']);
    expect(new URL(page.url()).searchParams.get('onto')).toBe(raw('v2.0.0'));
  });
});
