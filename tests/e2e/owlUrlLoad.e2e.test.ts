/**
 * E2E test: load ontology from URL when URL returns RDF/XML (OWL).
 */
import { describe, it, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const EDITOR_URL = process.env.EDITOR_URL || process.env.EDITOR_E2E_URL || 'http://localhost:5173/';

const MINIMAL_OWL = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:ex="http://example.org/owl-test#">
  <owl:Ontology rdf:about="http://example.org/owl-test"/>
  <owl:Class rdf:about="http://example.org/owl-test#TestClass">
    <rdfs:label>Test Class</rdfs:label>
  </owl:Class>
</rdf:RDF>`;

describe('OWL URL load E2E', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  beforeEach(async () => {
    // Close previous page if it exists (full refresh between tests)
    if (page) {
      await page.close();
    }
    
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(5000);
    
    // Full page reload for each test
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, { timeout: 5000 });
    await page.waitForTimeout(250);
    
    // Hide open ontology modal
    await page.evaluate(() => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  it('loads RDF/XML from URL and shows graph with one node', async () => {
    const owlUrl = 'https://e2e-owl.test/ontology.owl';
    const routePattern = /e2e-owl\.test.*ontology\.owl/;
    await page.route(routePattern, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/rdf+xml',
        body: MINIMAL_OWL,
      });
    });

    await page.locator('#openOntologyBtn').click();
    await page.getByRole('button', { name: /open ontology from url/i }).click();
    const urlInput = page.getByPlaceholder(/example\.com\/ontology\.ttl/);
    await urlInput.waitFor({ state: 'visible', timeout: 3000 });
    await urlInput.fill(owlUrl);

    // Wait for the ontology URL to be requested and fulfilled before submitting
    const responsePromise = page.waitForResponse(
      (res) => routePattern.test(res.url()) && res.status() === 200,
      { timeout: 5000 }
    );
    await urlInput.press('Enter');

    await responsePromise;

    // Editor should show (no error modal); wait for viz controls
    await page.locator('#vizControls').waitFor({ state: 'visible', timeout: 5000 });
    // Graph should have one node (status bar updates after render); wait for it
    await page.waitForFunction(
      () => document.getElementById('nodeCount')?.textContent?.trim() === '1',
      { timeout: 3000 }
    );
    const nodeCount = await page.locator('#nodeCount').textContent();
    expect(nodeCount?.trim()).toBe('1');

    await page.unroute(routePattern);
  }, 10000);
});
