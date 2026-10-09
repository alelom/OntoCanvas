/**
 * The fetchable import example (examples/imports/fetchable-child.ttl, #104), end to end: opened by URL, its
 * relative owl:imports is read from next to it, and what the parent declares shows in the menus as context.
 * The two files are served from a made-up address, so the test needs no network.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { blockExternalRequests, waitForAppReady, waitForImportsSettled } from './testHelpers';

const EXAMPLES = join(dirname(fileURLToPath(import.meta.url)), '../../examples/imports');
const WHERE = 'https://examples.test/imports/';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser.close();
});
beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(5000);
  await blockExternalRequests(page);
  const served: Record<string, string> = {
    [`${WHERE}fetchable-child.ttl`]: readFileSync(join(EXAMPLES, 'fetchable-child.ttl'), 'utf-8'),
    [`${WHERE}fetchable-parent.ttl`]: readFileSync(join(EXAMPLES, 'fetchable-parent.ttl'), 'utf-8'),
  };
  await page.route(`${WHERE}*`, (route) => {
    const body = served[route.request().url()];
    return body === undefined
      ? route.abort()
      : route.fulfill({ status: 200, contentType: 'text/turtle', headers: { 'access-control-allow-origin': '*' }, body });
  });
});
afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

describe('fetchable-child.ttl (#104)', () => {
  it("lists what the parent declares in the menus, without drawing it, once the import has been read", async () => {
    await page.goto(`http://localhost:5173/?onto=${encodeURIComponent(`${WHERE}fetchable-child.ttl`)}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await waitForAppReady(page);
    await waitForImportsSettled(page);

    await page.locator('details#edgeStylesMenu > summary').click();
    await page.locator('details#dataPropsMenu > summary').click();
    await expect
      .poll(() => page.evaluate(() => document.getElementById('edgeStylesContent')?.textContent ?? ''), { timeout: 5000 })
      .toContain('parent:author');
    const dataProps = await page.evaluate(() => document.getElementById('dataPropsContent')?.textContent ?? '');
    expect(dataProps).toContain('parent:title');
    expect(dataProps).toContain('xsd:string');
    expect(dataProps).toContain('parent:published on');
    expect(dataProps).toContain('xsd:date');

    // None of it is drawn: Report and the faded Document, no property boxes.
    const nodeIds = await page.evaluate(() => (window as any).__EDITOR_TEST__.getNetwork().body.nodeIndices.map(String) as string[]);
    expect(nodeIds.sort()).toEqual(['Report', 'http://example.org/examples/fetchable-parent#Document']);
  }, 15000);
});
