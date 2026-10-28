/**
 * Example images in the hover tooltip (#142), on examples/display/example-images.ttl opened by URL: the images are
 * relative IRIs, served from next to it. The rotation's timing and the state are unit-tested
 * (tests/unit/canvasTooltip.test.ts); this checks the real page: the images load, rotate, and the tooltip can be
 * reached and used.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { waitForAppReady } from './testHelpers';
import { EDITOR_URL } from './editorUrl';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLE_DIR = join(__dirname, '../../examples/display');
const ONTOLOGY_URL = 'https://example.org/examples/display/example-images.ttl';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  await browser.close();
});

afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

async function open(viewport = { width: 1200, height: 800 }, query = ''): Promise<void> {
  page = await browser.newPage({ viewport });
  page.setDefaultTimeout(5000);
  await page.route(
    (url) => url.hostname === 'example.org',
    (route) => {
      const path = new URL(route.request().url()).pathname.replace('/examples/display/', '');
      const file = join(EXAMPLE_DIR, path);
      if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
      const contentType = path.endsWith('.png') ? 'image/png' : 'text/turtle';
      return route.fulfill({ status: 200, contentType, headers: { 'access-control-allow-origin': '*' }, body: readFileSync(file) });
    }
  );
  await page.goto(`${EDITOR_URL}?onto=${encodeURIComponent(ONTOLOGY_URL)}${query}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await waitForAppReady(page);
}

/** Page coordinates of a node's centre, or of an edge's label. */
async function pointOf(kind: 'node' | 'label', id: string): Promise<{ x: number; y: number }> {
  return page.evaluate(([kind, id]) => {
    const net = (window as any).__EDITOR_TEST__.getNetwork();
    const edgeId = kind === 'label' ? Object.keys(net.body.edges).find((e: string) => e.includes(id)) : null;
    const p = kind === 'node' ? net.getPositions([id])[id] : net.body.edges[edgeId!].edgeType.getPoint(0.5);
    const r = document.querySelector('#network')!.getBoundingClientRect();
    const d = net.canvasToDOM(p);
    return { x: r.left + d.x, y: r.top + d.y };
  }, [kind, id] as const);
}

/** What the tooltip shows: its comment, the file of the image shown (once loaded), the counter, the fallback text. */
const shown = () =>
  page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.canvas-tooltip');
    if (!el || el.style.display === 'none') return null;
    const img = el.querySelector<HTMLImageElement>('.canvas-tooltip-image.is-shown');
    return {
      text: el.querySelector('.canvas-tooltip-text')?.textContent ?? null,
      image: img && img.complete && img.naturalWidth > 0 ? img.src.split('/').pop() : null,
      counter: el.querySelector('.canvas-tooltip-counter')?.textContent ?? null,
      missing: el.querySelector('.canvas-tooltip-image-missing.is-shown')?.textContent ?? null,
    };
  });

describe('example images in the hover tooltip (#142)', () => {
  it('a class shows its comment and first image, then rotates to the next', async () => {
    await open();
    const at = await pointOf('node', 'Widget');
    await page.mouse.move(at.x, at.y);
    await expect.poll(shown).toMatchObject({ text: 'A part with three example images.', image: 'Widget_01.png', counter: '1/3' });
    await expect.poll(shown, { timeout: 4000 }).toMatchObject({ image: 'Widget_02.png', counter: '2/3' });
  }, 10000);

  it('the cursor can move onto the tooltip, and › moves to the next image', async () => {
    await open();
    const at = await pointOf('node', 'Widget');
    await page.mouse.move(at.x, at.y);
    await expect.poll(shown).toMatchObject({ image: 'Widget_01.png' });
    const next = page.locator('.canvas-tooltip-carousel button[aria-label="Next image"]');
    const box = (await next.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(shown).toMatchObject({ image: 'Widget_02.png', counter: '2/3' });
  }, 10000);

  it("a relationship's label shows its images", async () => {
    await open();
    const at = await pointOf('label', 'hasPart');
    await page.mouse.move(at.x, at.y);
    await expect.poll(shown).toMatchObject({ text: 'A widget has gadgets as parts.', image: 'hasPart_01.png', counter: '1/2' });
  }, 10000);

  it('an image that does not exist says so', async () => {
    await open();
    const at = await pointOf('node', 'Gizmo');
    await page.mouse.move(at.x, at.y);
    await expect.poll(shown).toMatchObject({ missing: expect.stringContaining('Image not available') });
  }, 10000);

  it('embedded in a small iframe, the preview shrinks and the tooltip stays inside the window', async () => {
    // Embedded mode, as in an iframe, in a window about the size of one: the canvas fills it.
    await open({ width: 420, height: 320 }, '&embed=1');
    const at = await pointOf('node', 'Widget');
    await page.mouse.move(at.x, at.y);
    await expect.poll(shown).toMatchObject({ image: 'Widget_01.png' });
    const box = await page.evaluate(() => (document.querySelector('.canvas-tooltip-preview') as HTMLElement).style.cssText);
    expect(box).toContain('width: 189px');
    const rect = await page.evaluate(() => document.querySelector('.canvas-tooltip')!.getBoundingClientRect().toJSON());
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(420);
    expect(rect.bottom).toBeLessThanOrEqual(320);
  }, 10000);
});
