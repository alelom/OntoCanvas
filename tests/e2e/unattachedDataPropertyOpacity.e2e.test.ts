/**
 * Free-standing data properties must take part in search dimming.
 *
 * A property with no rdfs:domain is drawn in its own band with no edge to any class, so it has no
 * class to inherit a search opacity from. It used to be given full opacity unconditionally: with a
 * query active every class and attached property dimmed while the domainless ones stayed bright,
 * making the nodes least relevant to the query the most prominent on the canvas.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { OPACITY_DIM } from '../../src/lib/searchHighlight';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EDITOR_URL = 'http://localhost:5173/';
const FIXTURE = join(__dirname, '../fixtures/aec-provenance-typing-stubs.ttl');

/** prov:generatedAtTime is a typing stub: no rdfs:range and no rdfs:domain. */
const UNATTACHED_NODE = '__dataprop__unattached__generatedAtTime';

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
    (id) => {
      const net = (window as any).__EDITOR_TEST__?.getNetwork?.();
      return !!net?.body?.data?.nodes?.get?.(id);
    },
    UNATTACHED_NODE,
    { timeout: 5000 }
  );
});

afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

async function search(p: Page, query: string): Promise<void> {
  await p.evaluate((q) => {
    const input = document.getElementById('searchQuery') as HTMLInputElement;
    input.value = q;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, query);
  await p.waitForTimeout(500);
}

/** Rendered opacity of a node, or 1 when the node carries none. */
function nodeOpacity(p: Page, nodeId: string): Promise<number> {
  return p.evaluate((id) => {
    const net = (window as any).__EDITOR_TEST__.getNetwork();
    const node = net.body.data.nodes.get(id);
    return node?.opacity ?? 1;
  }, nodeId);
}

describe('Search dimming of free-standing data properties (E2E)', () => {
  it('applies the external-ontology fade, as an attached imported term does', async () => {
    // prov:generatedAtTime carries rdfs:isDefinedBy, so it is an imported term and reads as faded
    // even with no search active. It used to be drawn at full opacity regardless.
    const opacity = await nodeOpacity(page, UNATTACHED_NODE);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
  });

  it('dims further when the query does not match it', async () => {
    const base = await nodeOpacity(page, UNATTACHED_NODE);

    await search(page, 'FieldAssertion');
    const dimmed = await nodeOpacity(page, UNATTACHED_NODE);

    // OPACITY_DIM, on top of the imported fade - the same composition attached nodes use.
    expect(dimmed).toBeCloseTo(base * OPACITY_DIM, 5);
    // And it is genuinely dimmer than a class that did match.
    expect(dimmed).toBeLessThan(await nodeOpacity(page, 'FieldAssertion'));
  });

  it('returns to its unsearched opacity when it does match', async () => {
    const base = await nodeOpacity(page, UNATTACHED_NODE);

    await search(page, 'generatedAtTime');

    expect(await nodeOpacity(page, UNATTACHED_NODE)).toBeCloseTo(base, 5);
  });
});
