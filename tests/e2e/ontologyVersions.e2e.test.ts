/**
 * The versions of the open ontology (#132, #133), end to end: an ontology served from GitHub is opened at tag
 * v1.0.0; its other tags are found in the background, the bottom bar says v2.0.0 is newer, and choosing it
 * from the list opens it. GitHub is answered by routes, so the test needs no network.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { waitForAppReady } from './testHelpers';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { EDITOR_URL } from './editorUrl';

const EXAMPLES = join(dirname(fileURLToPath(import.meta.url)), '../../examples/versions');
const WHERE = 'https://examples.test/versions/';

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

/** The list's entries, once the button is there. */
async function listed(): Promise<string[]> {
  await page.locator('#ontologyVersionsBtn').click();
  const items = await page.locator('#ontologyVersionsList [data-version]').allTextContents();
  await page.locator('#ontologyVersionsBtn').click();
  return items;
}

describe('versions of the open ontology (#132, #133)', () => {
  it('still offers the later versions after switching to the first one, which names none (examples/versions)', async () => {
    await page.route(`${WHERE}*`, (route) => {
      const file = route.request().url().slice(WHERE.length);
      return /^building-[\d.]+\.ttl$/.test(file)
        ? route.fulfill({ status: 200, contentType: 'text/turtle', headers: CORS, body: readFileSync(join(EXAMPLES, file), 'utf-8') })
        : route.abort();
    });
    await page.goto(`${EDITOR_URL}?onto=${encodeURIComponent(`${WHERE}building-2.0.0.ttl`)}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await waitForAppReady(page);
    await page.locator('#ontologyVersionsBtn').waitFor();
    await page.locator('#ontologyVersionsBtn').click();
    await page.locator('#ontologyVersionsList [data-version="1.0.0"]').click();

    await expect.poll(() => page.evaluate(() => document.getElementById('ontologyVersion')?.textContent), { timeout: 5000 }).toBe('v1.0.0');
    await expect.poll(() => page.locator('#ontologyNewer').textContent(), { timeout: 5000 }).toBe(' (2.0.0 available)');
    expect(await listed()).toEqual(['2.0.0 · seen earlier in this tab', '1.1.0 · seen earlier in this tab', '✓ 1.0.0 · open now']);
  });

  it('says a newer GitHub tag exists, lists the versions, and opens the one chosen', async () => {
    await page.goto(`${EDITOR_URL}?onto=${encodeURIComponent(raw('v1.0.0'))}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await waitForAppReady(page);
    const button = page.locator('#ontologyVersionsBtn');
    await expect.poll(() => page.locator('#ontologyNewer').textContent(), { timeout: 5000 }).toBe(' (v2.0.0 available)');
    expect(await button.textContent()).toBe('versions ▾');

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
