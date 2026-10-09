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

  it("owl:Thing itself can't be deleted", async () => {
    const before = await page.evaluate(() => (window as any).__EDITOR_TEST__.getQuads(null, null).length);
    await page.evaluate((id) => (window as any).__EDITOR_TEST__.selectNodeById(id), THING);
    expect(await page.evaluate(() => (window as any).__EDITOR_TEST__.performDelete())).toBe(false);
    expect(await page.evaluate(() => (window as any).__EDITOR_TEST__.getQuads(null, null).length)).toBe(before);
    expect(await shownNodeIds()).toContain(THING);
  }, 10000);
});
