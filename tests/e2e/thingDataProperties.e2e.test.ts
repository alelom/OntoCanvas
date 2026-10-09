/**
 * Data properties with rdfs:domain owl:Thing (#80): drawn once under an owl:Thing node by default, under
 * every class with the toggle off; the toggle is saved in the display config. Deleting a box under Thing
 * deletes the property after a confirmation; owl:Thing itself can't be deleted. The attachment rules are
 * unit-tested in tests/unit/thingDataProperties.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { blockExternalRequests, loadTestFile, waitForAppReady } from './testHelpers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '../fixtures/thing-data-properties.ttl');
const EDITOR_URL = 'http://localhost:5173/';
const THING = 'http://www.w3.org/2002/07/owl#Thing';
const NAME = 'http://example.org/thingdp#name';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage({ acceptDownloads: true });
  page.setDefaultTimeout(5000);
  await blockExternalRequests(page);
  // Headless Chromium can't answer the save picker; without it the app downloads the file instead.
  await page.addInitScript(() => { delete (window as any).showSaveFilePicker; });
  await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });
  await loadTestFile(page, FIXTURE);
});

afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

/** The data-property boxes on the canvas, as "class/property". */
const boxes = (): Promise<string[]> =>
  page.evaluate(() =>
    ((window as any).__EDITOR_TEST__.getNetwork().body.nodeIndices as string[])
      .map((id) => id.match(/^__dataprop__(.+)__([^_]+)$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => `${m[1].replace('http://www.w3.org/2002/07/owl#', 'owl:')}/${m[2]}`)
      .sort()
  );
const shownNodeIds = (): Promise<string[]> => page.evaluate(() => (window as any).__EDITOR_TEST__.getNetwork().body.nodeIndices);

/** Double-click the box of a node on the canvas, with the mouse, as a user would. */
async function dblclickNode(id: string): Promise<void> {
  const at = await page.evaluate((id) => {
    const net = (window as any).__EDITOR_TEST__.getNetwork();
    const dom = net.canvasToDOM(net.getPositions([id])[id]);
    const r = document.getElementById('network')!.getBoundingClientRect();
    return { x: r.left + dom.x, y: r.top + dom.y };
  }, id);
  await page.mouse.dblclick(at.x, at.y);
}

describe('owl:Thing data properties (#80)', () => {
  it('are drawn once under owl:Thing by default, and under every class with the toggle off', async () => {
    expect(await page.locator('#clusterThingDataProps').isChecked()).toBe(true);
    expect(await shownNodeIds()).toContain(THING);
    // nick has no domain: it stays free-standing either way.
    expect(await boxes()).toEqual(['Person/age', 'owl:Thing/homepage', 'owl:Thing/name', 'unattached/nick']);

    await page.locator('#clusterThingDataProps').uncheck();
    await waitForAppReady(page);
    expect(await shownNodeIds()).not.toContain(THING);
    expect(await boxes()).toEqual([
      'Agent/homepage', 'Agent/name', 'Document/homepage', 'Document/name', 'Person/age', 'Person/homepage', 'Person/name', 'unattached/nick',
    ]);
  }, 10000);

  it('draws the owl:Thing node dimmed, labelled just "Thing", with no "defined by" note: it is a built-in', async () => {
    // The fixture declares the owl prefix, which used to make the label "owl: Thing".
    const node = await page.evaluate(
      (id) => {
        const n = (window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.get(id);
        return { label: n.label as string, opacity: n.opacity as number };
      },
      THING
    );
    expect(node.label).toBe('Thing');
    expect(node.opacity).toBeLessThan(1);
  }, 10000);

  it('the toggle is saved in the display config', async () => {
    await page.locator('#clusterThingDataProps').uncheck();
    await waitForAppReady(page);
    const download = page.waitForEvent('download', { timeout: 5000 });
    await page.locator('#saveDisplayConfig').click();
    const config = JSON.parse(readFileSync((await (await download).path())!, 'utf-8'));
    expect(config.clusterThingDataProperties).toBe(false);
  }, 10000);

  it('deleting a box under owl:Thing deletes the property after a confirmation', async () => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); void d.accept(); });
    await page.evaluate((id) => (window as any).__EDITOR_TEST__.selectNodeById(id), `__dataprop__${THING}__name`);
    await page.evaluate(() => (window as any).__EDITOR_TEST__.performDelete());
    await waitForAppReady(page);
    expect(dialogs).toEqual(['Delete data property "name"?']);
    expect(await page.evaluate((s) => (window as any).__EDITOR_TEST__.getQuads(s, null), NAME)).toEqual([]);
    expect(await boxes()).toEqual(['Person/age', 'owl:Thing/homepage', 'unattached/nick']);
  }, 10000);

  it('deleting several boxes under owl:Thing deletes every one of those properties', async () => {
    page.on('dialog', (d) => { void d.accept(); });
    await page.evaluate((ids) => (window as any).__EDITOR_TEST__.getNetwork().selectNodes(ids), [
      `__dataprop__${THING}__name`, `__dataprop__${THING}__homepage`,
    ]);
    await page.evaluate(() => (window as any).__EDITOR_TEST__.performDelete());
    await waitForAppReady(page);
    expect(await page.evaluate((s) => (window as any).__EDITOR_TEST__.getQuads(s, null), NAME)).toEqual([]);
    expect(await boxes()).toEqual(['Person/age', 'unattached/nick']);
  }, 10000);

  it('refuses to delete a box under owl:Thing together with other selected items, and deletes nothing', async () => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); void d.accept(); });
    const before = await page.evaluate(() => (window as any).__EDITOR_TEST__.getQuads(null, null).length);
    await page.evaluate((ids) => (window as any).__EDITOR_TEST__.getNetwork().selectNodes(ids), [
      `__dataprop__${THING}__name`, 'Document',
    ]);
    await page.evaluate(() => (window as any).__EDITOR_TEST__.performDelete());
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).toMatch(/on their own/);
    expect(await page.evaluate(() => (window as any).__EDITOR_TEST__.getQuads(null, null).length)).toBe(before);
    expect(await boxes()).toEqual(['Person/age', 'owl:Thing/homepage', 'owl:Thing/name', 'unattached/nick']);
  }, 10000);

  it('double-clicking a box under owl:Thing edits the property and keeps its domain owl:Thing', async () => {
    await dblclickNode(`__dataprop__${THING}__name`);
    await page.locator('#editDataPropertyModal').waitFor({ state: 'visible' });
    await page.locator('#editDataPropComment').fill('What something is called.');
    await page.locator('#editDataPropConfirm').click();
    await waitForAppReady(page);

    const quads = await page.evaluate((s) => (window as any).__EDITOR_TEST__.getQuads(s, null), NAME);
    expect(quads.filter((q: any) => q.predicate.endsWith('#domain')).map((q: any) => q.object)).toEqual([THING]);
    expect(quads.find((q: any) => q.predicate.endsWith('#comment'))?.object).toBe('What something is called.');
    // Still one box, still under owl:Thing, not copied to the classes.
    expect(await boxes()).toEqual(['Person/age', 'owl:Thing/homepage', 'owl:Thing/name', 'unattached/nick']);
  }, 10000);

  it("owl:Thing itself can't be deleted", async () => {
    const before = await page.evaluate(() => (window as any).__EDITOR_TEST__.getQuads(null, null).length);
    await page.evaluate((id) => (window as any).__EDITOR_TEST__.selectNodeById(id), THING);
    expect(await page.evaluate(() => (window as any).__EDITOR_TEST__.performDelete())).toBe(false);
    expect(await page.evaluate(() => (window as any).__EDITOR_TEST__.getQuads(null, null).length)).toBe(before);
    expect(await shownNodeIds()).toContain(THING);
  }, 10000);
});
