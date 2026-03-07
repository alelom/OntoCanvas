/**
 * E2E tests for URL load failure handling (modals before editor).
 * Intercepts the ontology URL: abort to simulate CORS, or 404 to test generic failure modal.
 */
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const EDITOR_URL = process.env.EDITOR_URL || process.env.EDITOR_E2E_URL || 'http://localhost:5173/';
const TEST_URL = 'https://example.test/ontology.ttl';

describe('URL load failure E2E', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  beforeEach(async () => {
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('#openOntologyBtn').waitFor({ state: 'visible', timeout: 4000 });
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  it('shows generic failure modal when URL returns 404', async () => {
    await page.route(/example\.test/, async (route) => {
      await route.fulfill({ status: 404, body: 'Not Found' });
    });

    await page.locator('#openOntologyBtn').click();
    await page.getByRole('button', { name: /open ontology from url/i }).click();
    const urlInput = page.getByPlaceholder(/example\.com\/ontology\.ttl/);
    await urlInput.waitFor({ state: 'visible', timeout: 2000 });
    await urlInput.fill(TEST_URL);
    await urlInput.press('Enter');

    await page.getByText('Failed to load ontology from URL').waitFor({ state: 'visible', timeout: 7000 });
    await page.getByRole('button', { name: /close/i }).click();
    await page.unroute(/example\.test/);
  }, 10000);

  it('shows CORS fallback modal with Download TTL and Open file when request is aborted', async () => {
    await page.route(/pi\.pauwel\.be/, async (route) => {
      await route.abort('blockedbyclient');
    });

    await page.locator('#openOntologyBtn').click();
    await page.getByRole('button', { name: /open ontology from url/i }).click();
    const urlInput = page.getByPlaceholder(/example\.com\/ontology\.ttl/);
    await urlInput.waitFor({ state: 'visible', timeout: 3000 });
    await urlInput.fill('https://pi.pauwel.be/voc/buildingelement/ontology.ttl');
    await urlInput.press('Enter');

    await page.getByText('Could not load ontology from URL').waitFor({ state: 'visible', timeout: 4000 });
    await page.getByText(/CORS/).waitFor({ state: 'visible', timeout: 2000 });
    await page.getByText(/Download TTL/).waitFor({ state: 'visible', timeout: 2000 });
    await page.getByRole('button', { name: /open file/i }).waitFor({ state: 'visible', timeout: 2000 });
    await page.unroute(/pi\.pauwel\.be/);
  }, 10000);
});
