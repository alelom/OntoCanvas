/**
 * E2E tests for URL load failure handling (modals before editor).
 * Intercepts the ontology URL with a 404 to test the generic failure modal.
 * Requests are served by page.route, so nothing here touches the network.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const EDITOR_URL = process.env.EDITOR_URL || process.env.EDITOR_E2E_URL || 'http://localhost:5173/';
const TEST_URL = 'https://example.test/ontology.ttl';

/**
 * Enter `url` in the "Open ontology from URL" dialog. A fresh page with no ontology and no URL parameter
 * opens the "Open ontology" dialog itself at start-up, so wait for that instead of clicking the toolbar
 * button (which the dialog covers once it appears).
 */
async function openFromUrl(page: Page, url: string): Promise<void> {
  await page.locator('#openOntologyModal').waitFor({ state: 'visible', timeout: 5000 });
  await page.getByRole('button', { name: /open ontology from url/i }).click();
  const urlInput = page.getByPlaceholder(/example\.com\/ontology\.ttl/);
  await urlInput.fill(url);
  await urlInput.press('Enter');
}

describe('URL load failure E2E', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  beforeEach(async () => {
    page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
  });

  afterEach(async () => {
    if (page && !page.isClosed()) await page.close();
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  it('shows generic failure modal when URL returns 404', async () => {
    const requested: string[] = [];
    await page.route(/example\.test/, async (route) => {
      requested.push(route.request().url());
      await route.fulfill({ status: 404, body: 'Not Found' });
    });

    await openFromUrl(page, TEST_URL);

    await page.getByText('Failed to load ontology from URL').waitFor({ state: 'visible', timeout: 5000 });
    expect(requested).toContain(TEST_URL);
    // The editor stays empty: no ontology was loaded.
    expect(await page.evaluate(() => (window as any).__EDITOR_TEST__.getTtlStore())).toBeNull();

    await page.getByRole('button', { name: /^close$/i }).click();
    await expect.poll(() => page.getByText('Failed to load ontology from URL').count(), { timeout: 5000 }).toBe(0);
  }, 10000);
});
