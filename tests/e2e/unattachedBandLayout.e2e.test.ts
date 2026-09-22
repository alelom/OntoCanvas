/**
 * The free-standing band must not draw its rows on top of each other.
 *
 * Band widths were computed from the raw label length while the node renders the label wrapped to
 * `wrapChars`. A typical label wraps to two or three lines — taller than the row spacing — so as
 * soon as there were enough domainless properties to need a second row, the rows overlapped. The
 * inflated widths also forced that second row earlier than necessary.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EDITOR_URL = 'http://localhost:5173/';
const FIXTURE = join(__dirname, '../fixtures/unattached-band-layout.ttl');

interface Box {
  id: string;
  top: number;
  left: number;
  right: number;
  bottom: number;
}

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
  await page.goto(EDITOR_URL);
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const fi = document.getElementById('fileInput') as HTMLInputElement | null;
    if (fi) {
      fi.style.display = 'block';
      fi.style.visibility = 'visible';
      fi.style.position = 'absolute';
      fi.style.width = '1px';
      fi.style.height = '1px';
    }
  });
  await page.locator('input#fileInput').setInputFiles(FIXTURE, { timeout: 5000 });
  await page.waitForFunction(
    () => {
      const net = (window as any).__EDITOR_TEST__?.getNetwork?.();
      return !!net?.body?.data?.nodes?.get?.('Anchor');
    },
    { timeout: 5000 }
  );
  await page.waitForTimeout(400);
});

afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

/** Canvas-space boxes of every free-standing data-property node. */
function bandBoxes(p: Page): Promise<Box[]> {
  return p.evaluate(() => {
    const net = (window as any).__EDITOR_TEST__.getNetwork();
    const out: Box[] = [];
    net.body.data.nodes.forEach((n: any) => {
      const id = String(n.id);
      if (!id.startsWith('__dataprop__unattached__')) return;
      const bb = net.getBoundingBox(id);
      out.push({ id, top: bb.top, left: bb.left, right: bb.right, bottom: bb.bottom });
    });
    return out;
  });
}

const overlaps = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('Free-standing data-property band layout (E2E)', () => {
  it('draws every domainless property', async () => {
    expect(await bandBoxes(page)).toHaveLength(10);
  });

  it('uses more than one row for this many long labels', async () => {
    const boxes = await bandBoxes(page);
    const rows = new Set(boxes.map((b) => Math.round(b.top)));
    expect(rows.size).toBeGreaterThan(1);
  });

  it('never draws two band nodes on top of each other', async () => {
    const boxes = await bandBoxes(page);
    const collisions = boxes
      .flatMap((a, i) => boxes.slice(i + 1).map((b) => [a, b] as const))
      .filter(([a, b]) => overlaps(a, b))
      .map(([a, b]) => `${a.id} overlaps ${b.id}`);
    expect(collisions).toEqual([]);
  });
});
