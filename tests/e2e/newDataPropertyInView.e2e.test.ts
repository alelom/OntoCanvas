/**
 * A data property the user just created must be visible.
 *
 * The Add data property modal asks for no rdfs:domain, so the new property is free-standing and is
 * drawn in the band below the class graph. The confirm handler calls applyFilter(true), which
 * restores the viewport the user was looking at — so on any non-trivial ontology the user clicked
 * OK and nothing appeared to happen, the new node sitting off-screen below the graph.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { loadTestFile } from './testHelpers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EDITOR_URL = 'http://localhost:5173/';
const FIXTURE = join(__dirname, '../fixtures/aec-provenance-typing-stubs.ttl');

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage();
  await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });
  // Waits for the initial render's fit, so the zoom set by each test is not undone by it.
  await loadTestFile(page, FIXTURE);
});

afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

/** Centre the view on a class node at a zoom that excludes the free-standing band below it. */
async function zoomToClassGraph(p: Page): Promise<void> {
  await p.evaluate(() => {
    const net = (window as any).__EDITOR_TEST__.getNetwork();
    const pos = net.getPositions(['FieldAssertion'])['FieldAssertion'];
    net.moveTo({ position: pos, scale: 1.5, animation: false });
  });
}

/** Is the node's centre inside the visible canvas? */
async function isNodeInViewport(p: Page, nodeId: string): Promise<boolean> {
  return p.evaluate((id) => {
    const net = (window as any).__EDITOR_TEST__.getNetwork();
    const pos = net.getPositions([id])[id];
    if (!pos) return false;
    const dom = net.canvasToDOM(pos);
    const container = document.getElementById('network')!;
    return dom.x >= 0 && dom.x <= container.clientWidth && dom.y >= 0 && dom.y <= container.clientHeight;
  }, nodeId);
}

/**
 * Drive the Add data property modal. The controls live in a side panel that Playwright's
 * actionability checks consider covered, so the clicks are dispatched directly.
 */
async function addDataProperty(p: Page, label: string, nodeId: string): Promise<void> {
  await p.evaluate(() => (document.getElementById('addDataPropertyBtn') as HTMLButtonElement).click());
  await p.waitForFunction(
    () => getComputedStyle(document.getElementById('addDataPropertyModal')!).display !== 'none', undefined,
    { timeout: 5000 }
  );
  await p.evaluate((text) => {
    const input = document.getElementById('addDataPropLabel') as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, label);
  await p.evaluate(() => (document.getElementById('addDataPropConfirm') as HTMLButtonElement).click());
  await p.waitForFunction(
    () => getComputedStyle(document.getElementById('addDataPropertyModal')!).display === 'none', undefined,
    { timeout: 5000 }
  );
  // The reveal is animated and ends with the view centred on the new node; wait for that.
  await p.waitForFunction(
    (id) => {
      const net = (window as any).__EDITOR_TEST__.getNetwork();
      const pos = net.getPositions([id])[id];
      const view = net.getViewPosition();
      return !!pos && Math.abs(pos.x - view.x) < 1 && Math.abs(pos.y - view.y) < 1;
    },
    nodeId,
    { timeout: 5000 }
  );
}

describe('A newly added data property is brought into view (E2E)', () => {
  it('scrolls the free-standing node into the viewport instead of leaving it off-screen', async () => {
    await zoomToClassGraph(page);
    const nodeId = '__dataprop__unattached__brandNewThing';

    await addDataProperty(page, 'brand new thing', nodeId);

    const exists = await page.evaluate((id) => {
      const net = (window as any).__EDITOR_TEST__.getNetwork();
      return !!net.body.data.nodes.get(id);
    }, nodeId);
    expect(exists, 'the new property should be drawn as a free-standing node').toBe(true);

    expect(await isNodeInViewport(page, nodeId)).toBe(true);
  });

  it('keeps the zoom level the user had', async () => {
    await zoomToClassGraph(page);
    const before = await page.evaluate(() => (window as any).__EDITOR_TEST__.getNetwork().getScale());

    await addDataProperty(page, 'another new thing', '__dataprop__unattached__anotherNewThing');

    const after = await page.evaluate(() => (window as any).__EDITOR_TEST__.getNetwork().getScale());
    expect(after).toBeCloseTo(before, 5);
  });
});
