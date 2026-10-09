/**
 * Hover tooltips on the canvas (#109): a class node, an edge's label and an edge's line each show one
 * tooltip, in the app's style, straight away. vis-network's own tooltip used to appear a second later as
 * well, in another style, repeating the same text.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { blockExternalRequests, loadTestFile } from './testHelpers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '../fixtures/tooltips.ttl');
const EDITOR_URL = 'http://localhost:5173/';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.setDefaultTimeout(5000);
  await blockExternalRequests(page);
  await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });
  await loadTestFile(page, FIXTURE);
});

afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

/** Page coordinates of a canvas point given by `where` (run in the page with the network). */
async function pagePoint(where: string, id: string): Promise<{ x: number; y: number }> {
  return page.evaluate(([where, id]) => {
    const net = (window as any).__EDITOR_TEST__.getNetwork();
    const p = where === 'node' ? net.getPositions([id])[id] : net.body.edges[id].edgeType.getPoint(where === 'label' ? 0.5 : 0.25);
    const r = document.querySelector('#network')!.getBoundingClientRect();
    const d = net.canvasToDOM(p);
    return { x: r.left + d.x, y: r.top + d.y };
  }, [where, id] as const);
}

/** The tooltips a user can see, as 'app: text' (ours) or 'vis: text' (vis-network's). */
const visibleTooltips = (): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.canvas-tooltip, .vis-tooltip')]
      .filter((el) => {
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && el.textContent?.trim();
      })
      .map((el) => `${el.classList.contains('canvas-tooltip') ? 'app' : 'vis'}: ${el.textContent!.trim()}`)
  );

/** Hover, see the app's tooltip at once, then wait until vis-network has shown its own (it does after its
 * delay) and check the user still sees just the one. */
async function expectOneTooltip(at: { x: number; y: number }, text: RegExp): Promise<void> {
  await page.mouse.move(at.x, at.y);
  await expect.poll(visibleTooltips, { timeout: 1000 }).toEqual([expect.stringMatching(new RegExp('^app: ' + text.source))]);
  await page.waitForFunction(() => (document.querySelector('.vis-tooltip') as HTMLElement | null)?.style.visibility === 'visible', undefined, { timeout: 5000 });
  expect(await visibleTooltips()).toEqual([expect.stringMatching(new RegExp('^app: ' + text.source))]);
}

describe('canvas hover tooltips (#109)', () => {
  it('a class node shows one tooltip, straight away', async () => {
    await expectOneTooltip(await pagePoint('node', 'Author'), /A person who writes books\./);
  }, 10000);

  it("an edge's label shows one tooltip, straight away", async () => {
    const edgeId = await page.evaluate(() => Object.keys((window as any).__EDITOR_TEST__.getNetwork().body.edges).find((id: string) => id.includes('writes')));
    await expectOneTooltip(await pagePoint('label', edgeId!), /The author of a book\./);
  }, 10000);

  it("an edge's line shows one tooltip, straight away", async () => {
    const edgeId = await page.evaluate(() => Object.keys((window as any).__EDITOR_TEST__.getNetwork().body.edges).find((id: string) => id.includes('writes')));
    await expectOneTooltip(await pagePoint('line', edgeId!), /The author of a book\./);
  }, 10000);
});
