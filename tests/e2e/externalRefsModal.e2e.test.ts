/**
 * E2E test: "Manage External Ontology References" modal shows refs from owl:imports or from used namespaces/prefixes.
 * Regression: DANO and similar ontologies use dc, geo, schema etc. without owl:imports; modal should still list them.
 * Each test runs in a fresh page to avoid state/route leakage and timeouts.
 */
import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const EDITOR_URL = process.env.EDITOR_URL || process.env.EDITOR_E2E_URL || 'http://localhost:5173/';

const TTL_WITH_IMPORTS = `@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix ex: <http://example.org/ext-ref-test#> .

<http://example.org/ext-ref-test> a owl:Ontology ;
  owl:imports <https://w3id.org/dano> .

ex:TestClass a owl:Class ;
  rdfs:label "Test Class" .
`;

const TTL_NO_IMPORTS_USES_DC_GEO = `@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix dc: <http://purl.org/dc/terms/> .
@prefix geo: <http://www.opengis.net/ont/geosparql#> .
@prefix ex: <http://example.org/no-imports#> .

ex:Ontology a owl:Ontology ;
  dc:title "No imports ontology" .

ex:SomeClass a owl:Class ;
  rdfs:label "Some Class" ;
  geo:hasGeometry ex:SomeGeometry .
`;

describe('External refs modal E2E', () => {
  let browser: Browser;
  let page: Page;
  const testUrl = 'https://e2e-external-refs.test/ontology.ttl';
  const testUrlNoImports = 'https://e2e-external-refs.test/no-imports.ttl';
  const routePattern = /e2e-external-refs\.test/;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(5000);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ !== undefined, { timeout: 5000 });
    // App shows Open Ontology modal after 100ms; wait for that then hide it so the modal doesn't intercept clicks
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForFunction(
      () => {
        const m = document.getElementById('openOntologyModal');
        return !m || (m as HTMLElement).style.display === 'none';
      },
      { timeout: 2000 }
    );
    await page.locator('#openOntologyBtn').waitFor({ state: 'visible', timeout: 5000 });
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  it('shows external references in modal when ontology has owl:imports', async () => {
    await page.route(routePattern, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/turtle',
        body: TTL_WITH_IMPORTS,
      });
    });

    await page.locator('#openOntologyBtn').click();
    await page.getByRole('button', { name: /open ontology from url/i }).click();
    const urlInput = page.getByPlaceholder(/example\.com\/ontology\.ttl/);
    await urlInput.waitFor({ state: 'visible', timeout: 3000 });
    await urlInput.fill(testUrl);

    const responsePromise = page.waitForResponse(
      (res) => routePattern.test(res.url()) && res.status() === 200,
      { timeout: 5000 }
    );
    await urlInput.press('Enter');
    await responsePromise;

    await page.locator('#vizControls').waitFor({ state: 'visible', timeout: 5000 });

    await page.locator('#manageExternalRefs').click();
    const modal = page.locator('#externalRefsModal');
    await modal.waitFor({ state: 'visible', timeout: 3000 });
    const listEl = page.locator('#externalRefsList');
    await listEl.waitFor({ state: 'visible', timeout: 2000 });

    const listText = await listEl.textContent();
    expect(listText).not.toContain('No external ontology references added yet.');
    expect(listText).toMatch(/w3id\.org\/dano/);
  }, 10000);

  it('shows external references when ontology has no owl:imports but uses dc/geo (DANO-like)', async () => {
    await page.route(routePattern, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/turtle',
        body: TTL_NO_IMPORTS_USES_DC_GEO,
      });
    });
    await page.route(/purl\.org|opengis\.net/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/turtle', body: '@prefix owl: <http://www.w3.org/2002/07/owl#> . <> a owl:Ontology .' });
    });

    await page.locator('#openOntologyBtn').click();
    await page.getByRole('button', { name: /open ontology from url/i }).click();
    const urlInput = page.getByPlaceholder(/example\.com\/ontology\.ttl/);
    await urlInput.waitFor({ state: 'visible', timeout: 3000 });
    await urlInput.fill(testUrlNoImports);

    const responsePromise = page.waitForResponse(
      (res) => routePattern.test(res.url()) && res.status() === 200,
      { timeout: 5000 }
    );
    await urlInput.press('Enter');
    await responsePromise;

    await page.locator('#vizControls').waitFor({ state: 'visible', timeout: 5000 });

    await page.locator('#manageExternalRefs').click();
    await page.locator('#externalRefsModal').waitFor({ state: 'visible', timeout: 3000 });
    const listEl = page.locator('#externalRefsList');
    await listEl.waitFor({ state: 'visible', timeout: 2000 });

    const listText = await listEl.textContent();
    expect(listText).not.toContain('No external ontology references added yet.');
    expect(listText?.match(/purl\.org\/dc|opengis\.net\/ont\/geosparql/)).toBeTruthy();
  }, 10000);
});
