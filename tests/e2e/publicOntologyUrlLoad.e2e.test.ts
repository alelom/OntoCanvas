/**
 * E2E tests: open real-world public ontology URLs in the editor.
 * Each test checks that the URL is not 404 before running, then opens the URL and asserts the graph loads.
 * Prefer TTL URLs where available; COB is OWL-only.
 */
import { describe, it, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const EDITOR_URL = process.env.EDITOR_URL || process.env.EDITOR_E2E_URL || 'http://localhost:5173/';

const PUBLIC_ONTOLOGY_URLS = [
  'https://rub-informatik-im-bauwesen.github.io/dano/',
  'https://pi.pauwel.be/voc/buildingelement/ontology.ttl',
  'https://raw.githubusercontent.com/OBOFoundry/COB/master/cob.owl',
  // Directory-style URL: resolver tries .../ontology.ttl when base URL returns 404/HTML
  'https://digitalconstruction.github.io/Processes/latest/',
] as const;

describe('Public ontology URL load E2E', () => {
  let browser: Browser;
  let page: Page;
  /** URL -> true if 404 (test should be skipped) */
  const url404: Record<string, boolean> = {};

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('#openOntologyBtn').waitFor({ state: 'visible', timeout: 5000 });

    for (const url of PUBLIC_ONTOLOGY_URLS) {
      try {
        const res = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: AbortSignal.timeout(10000),
          headers: {
            Accept: 'text/turtle, application/rdf+xml, application/ld+json, */*',
          },
        });
        url404[url] = res.status === 404;
      } catch {
        url404[url] = false;
      }
    }
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  for (const url of PUBLIC_ONTOLOGY_URLS) {
    const ontologyUrl = url;
    it.skipIf(() => url404[ontologyUrl] === true)(
      `opens and loads ontology from ${ontologyUrl}`,
      async () => {
        await page.locator('#openOntologyBtn').click();
        await page.getByRole('button', { name: /open ontology from url/i }).click();
        const urlInput = page.getByPlaceholder(/example\.com\/ontology\.ttl/);
        await urlInput.waitFor({ state: 'visible', timeout: 3000 });
        await urlInput.fill(ontologyUrl);
        await urlInput.press('Enter');

        await page.locator('#vizControls').waitFor({ state: 'visible', timeout: 15000 });
        await page.waitForFunction(
          () => {
            const nodeCountEl = document.getElementById('nodeCount');
            const nodeCount = nodeCountEl?.textContent?.trim();
            return (
              nodeCount !== undefined &&
              nodeCount !== '' &&
              Number.isFinite(Number(nodeCount)) &&
              Number(nodeCount) >= 1
            );
          },
          { timeout: 10000 }
        );
        const nodeCount = await page.locator('#nodeCount').textContent();
        expect(Number(nodeCount?.trim())).toBeGreaterThanOrEqual(1);
      },
      20000
    );
  }
});
