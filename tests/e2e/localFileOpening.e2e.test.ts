/**
 * E2E tests for opening local files in new tabs using IndexedDB tokens.
 * Tests the "Open external ontology" feature for local files.
 *
 * "Open external ontology" on a node from an imported ontology looks for the imported file next to the
 * open one; if found, it stores that file's content in IndexedDB under a one-time token and opens
 * `?localFile=<token>` in a new tab. Finding the sibling needs a FileSystemFileHandle with `getParent()`,
 * which a test cannot hand the browser, so that part is unit-tested in
 * tests/unit/localFileOpeningFromE2e.test.ts. This file covers the browser side: a `?localFile=` tab loads
 * the stored ontology without any network request (no CORS error) and consumes the token.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { waitForAppReady } from './testHelpers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const TEST_FIXTURES_DIR = join(__dirname, '../fixtures/imported-ontology');
/** The app's token store module, as the dev server serves it. */
const TOKEN_STORAGE_MODULE = '/src/lib/localFileTokenStorage.ts';

/**
 * Page script calling `fn(...args)` from the token store module. A string, because Vitest would rewrite a
 * dynamic import() written in a function passed to page.evaluate.
 */
function callTokenStorage(fn: string, args: unknown[]): string {
  return `import(${JSON.stringify(TOKEN_STORAGE_MODULE)}).then((m) => m[${JSON.stringify(fn)}](...${JSON.stringify(args)}))`;
}

let browser: Browser;
let context: BrowserContext;
let page: Page;

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
  await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });

  // Enable debug mode for tests
  await page.evaluate(() => {
    localStorage.setItem('ontologyEditorDebug', 'true');
  });
});

afterEach(async () => {
  await context.close();
});

describe('Local File Opening E2E', () => {
  it('should open a local file in a new tab from its ?localFile= token', async () => {
    const siblingFile = join(TEST_FIXTURES_DIR, 'object-props-child.ttl');
    expect(existsSync(siblingFile)).toBe(true);
    const content = readFileSync(siblingFile, 'utf-8');

    // Store the file the way "Open external ontology" does before opening the tab.
    const token: string = await page.evaluate(
      callTokenStorage('storeLocalFileContent', [content, 'object-props-child.ttl', 'object-props-child.ttl'])
    );
    expect(token).toBeTruthy();

    // The ontology itself must come from IndexedDB, not from its URL. (The editor may still look up the
    // ontologies it imports, e.g. object-base; those are answered with a 404 so nothing reaches the network.)
    const externalRequests: string[] = [];
    await context.route(/^https?:\/\/example\.org\//, async (route) => {
      externalRequests.push(route.request().url());
      await route.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'Not Found' });
    });

    const newPage = await context.newPage();
    newPage.setDefaultTimeout(5000);
    await newPage.goto(`${EDITOR_URL}?localFile=${encodeURIComponent(token)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 5000,
    });

    // Ready means the ontology is loaded and the "Open ontology" dialog is not showing.
    await waitForAppReady(newPage);

    const loadedOntology = await newPage.evaluate(() => {
      const testHook = (window as any).__EDITOR_TEST__;
      const errorMsg = document.getElementById('errorMsg') as HTMLElement;
      const hasError = !!errorMsg && errorMsg.style.display !== 'none' && !!errorMsg.textContent?.includes('CORS');
      return { nodeIds: testHook.getNodeIds() as string[], hasCorsError: hasError };
    });

    expect(loadedOntology.nodeIds).toEqual(expect.arrayContaining(['ChildClassA', 'ChildClassB']));
    expect(loadedOntology.hasCorsError).toBe(false);
    expect(externalRequests.filter((url) => url.includes('object-extended'))).toEqual([]);

    // The token is one-time use: it is deleted once the tab has loaded it.
    await expect
      .poll(
        () => newPage.evaluate(callTokenStorage('retrieveLocalFileContent', [token])),
        { timeout: 5000 }
      )
      .toBeNull();
  });
});
