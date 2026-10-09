/**
 * E2E tests for verifying external node URLs are correct.
 * Tests that external nodes have the correct externalOntologyUrl set: the URL "Open external ontology" opens
 * is derived from it, so that is what these tests observe (the rendered node does not carry the field).
 *
 * The URL lookup itself (getNodeOntologyUrl) is unit-tested in tests/unit/externalNodeUrl.test.ts.
 * Requests to example.org are answered by a route, so nothing here touches the network.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { loadTestFile } from './testHelpers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const TEST_FIXTURES_DIR = join(__dirname, '../fixtures/imported-ontology');

/** properties-child.ttl subclasses base:BaseClass from the imported ontology <http://example.org/base>. */
const BASE_CLASS_ID = 'http://example.org/base#BaseClass';
/** What "Open external ontology" opens for an external ontology URL of http://example.org/base. */
const EXPECTED_OPENED_ONTO = 'http://example.org/base.html';

let browser: Browser;
let context: BrowserContext;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  context = await browser.newContext();
  // The editor may fetch the imported ontology, and a tab opened on it will; never reach the network.
  await context.route(/^https?:\/\/example\.org\//, (route) =>
    route.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'Not Found' })
  );
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

/** Load properties-child.ttl and check the external BaseClass node is drawn. */
async function loadPropertiesChild(p: Page): Promise<void> {
  const childFile = join(TEST_FIXTURES_DIR, 'properties-child.ttl');
  expect(existsSync(childFile)).toBe(true);
  await loadTestFile(p, childFile);
  const renderedIds: string[] = await p.evaluate(() =>
    (window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.getIds().map(String)
  );
  expect(renderedIds).toContain(BASE_CLASS_ID);
}

function ontoParam(openedUrl: string): string | null {
  return new URL(openedUrl).searchParams.get('onto');
}

describe('External Node URL E2E', () => {
  it('should have correct externalOntologyUrl for BaseClass in properties-child.ttl', async () => {
    await loadPropertiesChild(page);

    // Record where "Open external ontology" would send its tab instead of opening one. A tab opened as
    // about:blank (on the click, before any wait for the folder) is sent on by setting its location.
    await page.evaluate(() => {
      (window as any).__openedUrls = [];
      window.open = ((url?: string | URL) => {
        if (String(url) === 'about:blank') {
          return { location: { set href(u: string) { (window as any).__openedUrls.push(u); } } };
        }
        (window as any).__openedUrls.push(String(url));
        return null;
      }) as typeof window.open;
    });

    await page.evaluate((id) => (window as any).__EDITOR_TEST__.openContextMenuForNode(id), BASE_CLASS_ID);
    // The item is offered only when the node's externalOntologyUrl matches a known external reference.
    await page.locator('#contextMenu').getByText('Open external ontology').click();

    await expect.poll(() => page.evaluate(() => (window as any).__openedUrls.length), { timeout: 5000 }).toBe(1);
    const opened: string = await page.evaluate(() => (window as any).__openedUrls[0]);
    // http://example.org/base converts to .../base.html; the parent http://example.org would not.
    expect(ontoParam(opened)).toBe(EXPECTED_OPENED_ONTO);
    expect(ontoParam(opened)).not.toBe('http://example.org');
  });

  it('should open correct external ontology URL when right-clicking on BaseClass', async () => {
    await loadPropertiesChild(page);

    // Where BaseClass is drawn on screen.
    const nodePosition = await page.evaluate((nodeId) => {
      const network = (window as any).__EDITOR_TEST__.getNetwork();
      const canvas = document.querySelector('#network') as HTMLElement;
      const rect = canvas.getBoundingClientRect();
      const pos = network.getPositions([nodeId])[nodeId];
      const dom = network.canvasToDOM({ x: pos.x, y: pos.y });
      return { x: rect.left + dom.x, y: rect.top + dom.y };
    }, BASE_CLASS_ID);

    // Right-click on the node to open context menu
    await page.mouse.click(nodePosition.x, nodePosition.y, { button: 'right' });
    await page.locator('#contextMenu').waitFor({ state: 'visible', timeout: 5000 });

    const openExternalBtn = page.locator('#contextMenu').getByText('Open external ontology');
    const [newTab] = await Promise.all([context.waitForEvent('page', { timeout: 5000 }), openExternalBtn.click()]);
    // The tab opens blank and is sent to the ontology straight after.
    await newTab.waitForURL((u) => u.searchParams.has('onto'), { timeout: 5000 });

    expect(newTab.url().startsWith(EDITOR_URL)).toBe(true);
    expect(ontoParam(newTab.url())).toBe(EXPECTED_OPENED_ONTO);
    expect(ontoParam(newTab.url())).not.toBe('http://example.org');
  });
});
