/**
 * Every E2E browser starts with no access to the real internet (#116): launchBrowser() aborts all requests to
 * anywhere but the dev server in each context it creates, and a route the test registers itself takes precedence.
 * Without it, tests whose fixtures import real URLs depended on other people's servers.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { launchBrowser } from './browser';

const EDITOR_URL = process.env.EDITOR_URL || process.env.EDITOR_E2E_URL || 'http://localhost:5173/';

let browser: Browser;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  await browser.close();
});

/** What a page's own fetch() of `url` does: its status, or the error name when the request never completed. */
const tryFetch = (page: import('playwright').Page, url: string) =>
  page.evaluate(async (u) => {
    try {
      return (await fetch(u, { mode: 'no-cors' })).type === 'opaque' ? 'reached' : 'answered';
    } catch (e) {
      return (e as Error).name;
    }
  }, url);

describe('E2E network isolation', () => {
  it('aborts requests to external hosts in a page from browser.newPage()', async () => {
    const page = await browser.newPage();
    try {
      await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
      expect(await tryFetch(page, 'https://example.com/')).toBe('TypeError');
      expect(await tryFetch(page, 'http://w3id.org/adiro/aec_geometry')).toBe('TypeError');
    } finally {
      await page.close();
    }
  });

  it('aborts them in a context from browser.newContext() too', async () => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
      expect(await tryFetch(page, 'https://example.com/')).toBe('TypeError');
    } finally {
      await context.close();
    }
  });

  it('still serves the dev server', async () => {
    const page = await browser.newPage();
    try {
      const response = await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
      expect(response?.ok()).toBe(true);
    } finally {
      await page.close();
    }
  });

  it("lets a test answer a URL itself: the route it registers takes precedence", async () => {
    const page = await browser.newPage();
    try {
      await page.route('https://served.test/**', (route) =>
        route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: 'hello' })
      );
      await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
      const body = await page.evaluate(async () => (await fetch('https://served.test/x')).text());
      expect(body).toBe('hello');
      // ...and everything else is still blocked.
      expect(await tryFetch(page, 'https://example.com/')).toBe('TypeError');
    } finally {
      await page.close();
    }
  });

  it('is what the plain Playwright launcher does not do (so the test above means something)', async () => {
    const plain = await chromium.launch({ headless: true });
    try {
      const page = await plain.newPage();
      // No page.goto to the internet: a blocked/unreachable result is fine either way; what matters is that nothing
      // aborted it on purpose, i.e. a route for it would see the request. Register one and check it is reached.
      let seen = false;
      await page.route('https://isolation-probe.test/**', (route) => {
        seen = true;
        return route.abort();
      });
      await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
      await tryFetch(page, 'https://isolation-probe.test/x');
      expect(seen).toBe(true);
    } finally {
      await plain.close();
    }
  });
});
