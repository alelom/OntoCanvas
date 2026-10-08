/**
 * E2E tests for verifying external ontology URL conversion.
 * Tests that when opening an external ontology, the URL is correctly converted
 * from the ontology URL (with hyphens) to the HTML documentation URL (with underscores and .html),
 * and that the editor can load the ontology back from that HTML URL.
 *
 * The conversion functions themselves are unit-tested (convertOntologyUrlToHtmlUrl, getOntologyUrlCandidates);
 * these tests cover the browser flow. Requests to the external ontology host are answered by page.route,
 * so nothing here touches the network.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { loadTestFile, waitForAppReady } from './testHelpers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const IMPORTED_FIXTURES_DIR = join(__dirname, '../fixtures/imported-ontology');

/** object-props-child-child.ttl imports this ontology, whose IRI has a hyphen. */
const EXTERNAL_ONTOLOGY_URL = 'http://example.org/object-extended';
const EXTERNAL_ONTOLOGY_HTML_URL = 'http://example.org/object_extended.html';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

let browser: Browser;
let context: BrowserContext;
let page: Page;

/**
 * Answer every request to example.org in this context: `served` maps exact URLs to Turtle bodies, anything
 * else gets a 404. Returns the list of requested URLs.
 */
async function routeExampleOrg(ctx: BrowserContext, served: Record<string, string> = {}): Promise<string[]> {
  const requested: string[] = [];
  await ctx.route(/^https?:\/\/example\.org\//, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    requested.push(request.url());
    const body = served[request.url()];
    if (body !== undefined) {
      await route.fulfill({ status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'text/turtle' }, body });
    } else {
      await route.fulfill({ status: 404, headers: CORS_HEADERS, body: 'Not Found' });
    }
  });
  return requested;
}

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  context = await browser.newContext();
  page = await context.newPage();
  page.setDefaultTimeout(5000);

  // Record window.open URLs BEFORE navigation
  await page.addInitScript(() => {
    const originalOpen = window.open;
    (window as any).__testOpenUrl = null;
    window.open = function (url?: string | URL | null, target?: string | undefined, features?: string | undefined) {
      if (url && typeof url === 'string') {
        (window as any).__testOpenUrl = url;
      }
      return originalOpen.call(this, url, target, features);
    };
  });
});

afterEach(async () => {
  await context.close();
});

describe('External Ontology URL Conversion E2E', () => {
  it('should convert external ontology URL from hyphens to underscores with .html when opening', async () => {
    await routeExampleOrg(context);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });

    const testFile = join(IMPORTED_FIXTURES_DIR, 'object-props-child-child.ttl');
    expect(existsSync(testFile)).toBe(true);
    await loadTestFile(page, testFile);

    // The imported class is drawn as an external node, identified by its full IRI (it is added to the
    // rendered graph, not to the ontology's own raw data).
    const externalNodeId = `${EXTERNAL_ONTOLOGY_URL}#ChildClass`;
    expect(
      await page.evaluate(() => (window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.getIds().map(String))
    ).toContain(externalNodeId);

    await page.evaluate((id) => (window as any).__EDITOR_TEST__.openContextMenuForNode(id), externalNodeId);
    const openExternalBtn = page.locator('#contextMenu').getByText('Open external ontology');

    const [newTab] = await Promise.all([context.waitForEvent('page', { timeout: 5000 }), openExternalBtn.click()]);

    const openedUrl: string = await page.evaluate(() => (window as any).__testOpenUrl);
    expect(openedUrl).toBe(newTab.url());

    // The opened URL should be in the format: base?onto=encodedUrl
    expect(openedUrl).toContain('?onto=');
    const decodedUrl = decodeURIComponent(openedUrl.split('?onto=')[1]);

    // Verify the URL was converted: hyphens -> underscores, added .html
    expect(decodedUrl).toBe(EXTERNAL_ONTOLOGY_URL.replace(/-/g, '_') + '.html');
    expect(decodedUrl).toBe(EXTERNAL_ONTOLOGY_HTML_URL);
    expect(decodedUrl).not.toBe(EXTERNAL_ONTOLOGY_URL);
    expect(decodedUrl).toMatch(/\.html$/);
    expect(decodedUrl).not.toContain('-');
  });

  it('should successfully load external ontology when opened via HTML URL (regression test)', async () => {
    // The ontology is published as Turtle at its hyphenated IRI + .ttl; the HTML documentation URL is a 404.
    const externalTtl = readFileSync(join(IMPORTED_FIXTURES_DIR, 'object-props-child.ttl'), 'utf-8');
    const requested = await routeExampleOrg(context, { [`${EXTERNAL_ONTOLOGY_URL}.ttl`]: externalTtl });

    // Navigate the way "Open external ontology" does: the HTML URL as the onto parameter.
    await page.goto(`${EDITOR_URL}?onto=${encodeURIComponent(EXTERNAL_ONTOLOGY_HTML_URL)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 5000,
    });

    await waitForAppReady(page);

    expect(requested).toContain(`${EXTERNAL_ONTOLOGY_URL}.ttl`);
    expect(await page.getByText('Failed to load ontology from URL').count()).toBe(0);
    const nodeIds: string[] = await page.evaluate(() => (window as any).__EDITOR_TEST__.getNodeIds());
    expect(nodeIds).toEqual(expect.arrayContaining(['ChildClassA', 'ChildClassB']));
  });
});
