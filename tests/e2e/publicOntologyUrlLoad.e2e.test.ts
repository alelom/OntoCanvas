/**
 * E2E tests: open ontologies by URL in the editor, the way users open published ontologies.
 *
 * The URLs have the shapes of real public ontologies (a Turtle file, an OWL/RDF-XML file, and directory-style
 * URLs whose ontology lives at .../ontology.ttl), but every request is answered by page.route, so the
 * tests never depend on the public internet or on those sites staying up.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { type Browser, type Page, type Route } from 'playwright';
import { launchBrowser } from './browser';
import { waitForAppReady } from './testHelpers';

const EDITOR_URL = process.env.EDITOR_URL || process.env.EDITOR_E2E_URL || 'http://localhost:5173/';

const TTL = `@prefix : <http://example.org/served#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

<http://example.org/served> rdf:type owl:Ontology .

:Building rdf:type owl:Class ; rdfs:label "Building" .
:Wall rdf:type owl:Class ; rdfs:label "Wall" ; rdfs:subClassOf :Building .
`;

const RDF_XML = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Ontology rdf:about="http://example.org/served"/>
  <owl:Class rdf:about="http://example.org/served#Building">
    <rdfs:label>Building</rdfs:label>
  </owl:Class>
  <owl:Class rdf:about="http://example.org/served#Wall">
    <rdfs:label>Wall</rdfs:label>
    <rdfs:subClassOf rdf:resource="http://example.org/served#Building"/>
  </owl:Class>
</rdf:RDF>
`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

/** Serve `body` at exactly `servedUrl` and 404 every other request to the external hosts. */
async function serveOnly(page: Page, servedUrl: string, body: string, contentType: string): Promise<string[]> {
  const requested: string[] = [];
  await page.route(
    (url) => url.origin !== new URL(EDITOR_URL).origin,
    async (route: Route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS_HEADERS });
        return;
      }
      requested.push(request.url());
      if (request.url() === servedUrl) {
        await route.fulfill({ status: 200, headers: { ...CORS_HEADERS, 'Content-Type': contentType }, body });
      } else {
        await route.fulfill({ status: 404, headers: CORS_HEADERS, body: 'Not Found' });
      }
    }
  );
  return requested;
}

/** Open `url` from the "Open ontology" dialog that a fresh page shows at start-up. */
async function openFromUrl(page: Page, url: string): Promise<void> {
  await page.locator('#openOntologyModal').waitFor({ state: 'visible', timeout: 5000 });
  await page.getByRole('button', { name: /open ontology from url/i }).click();
  const urlInput = page.getByPlaceholder(/example\.com\/ontology\.ttl/);
  await urlInput.fill(url);
  await urlInput.press('Enter');
}

function classNodeIds(page: Page): Promise<string[]> {
  return page.evaluate(() => ((window as any).__EDITOR_TEST__.getRawData().nodes as Array<{ id: string }>).map((n) => n.id).sort());
}

const CASES: Array<{ name: string; url: string; servedUrl: string; body: string; contentType: string }> = [
  {
    name: 'a Turtle file URL',
    url: 'https://pi.pauwel.be/voc/buildingelement/ontology.ttl',
    servedUrl: 'https://pi.pauwel.be/voc/buildingelement/ontology.ttl',
    body: TTL,
    contentType: 'text/turtle',
  },
  {
    name: 'an OWL (RDF/XML) file URL',
    url: 'https://raw.githubusercontent.com/OBOFoundry/COB/master/cob.owl',
    servedUrl: 'https://raw.githubusercontent.com/OBOFoundry/COB/master/cob.owl',
    body: RDF_XML,
    contentType: 'application/rdf+xml',
  },
  {
    // Directory-style URL: the resolver tries .../ontology.ttl when the base URL returns 404
    name: 'a directory-style URL whose ontology is at ontology.ttl',
    url: 'https://digitalconstruction.github.io/Processes/latest/',
    servedUrl: 'https://digitalconstruction.github.io/Processes/latest/ontology.ttl',
    body: TTL,
    contentType: 'text/turtle',
  },
];

describe('Public ontology URL load E2E', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await launchBrowser();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    page.setDefaultTimeout(5000);
  });

  afterEach(async () => {
    if (page && !page.isClosed()) await page.close();
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  for (const c of CASES) {
    it(`opens and loads an ontology from ${c.name}`, async () => {
      const requested = await serveOnly(page, c.servedUrl, c.body, c.contentType);
      await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });

      await openFromUrl(page, c.url);

      await waitForAppReady(page);
      expect(requested).toContain(c.servedUrl);
      expect(await classNodeIds(page)).toEqual(['Building', 'Wall']);
      await expect
        .poll(() => page.evaluate(() => Number(document.getElementById('nodeCount')?.textContent?.trim())), { timeout: 5000 })
        .toBe(2);
    }, 10000);
  }
});
