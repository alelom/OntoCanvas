/**
 * E2E: opening a local folder of data (#227) and the images its values name (#228), with examples/datasets/run-folder. The
 * browser's folder picker cannot be driven by a test, so the page is given none and the folder goes through the file input
 * (`webkitdirectory`), as in Firefox and Safari; the picker itself is unit-tested. There is no network.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { EDITOR_URL } from './editorUrl';
import { traceOnFailure } from './traceOnFailure';

const RUN_DIR = join(__dirname, '../../examples/datasets/run-folder/runs/run-0001');
const DATA = 'http://example.org/examples/run-folder/run-0001/';
const TITLEBLOCK = 'http://example.org/examples/run-folder#Titleblock';

describe('a folder of data, with its images', () => {
  let browser: Browser;
  let page: Page;

  /** Lists the titleblocks and shows the detail of sheet `n`'s. */
  async function showTitleblock(n: number): Promise<void> {
    const group = page.locator(`[data-individuals-group="${TITLEBLOCK}"]`);
    if ((await group.locator('[data-individuals-group-toggle]').getAttribute('aria-expanded')) !== 'true') await group.locator('[data-individuals-group-toggle]').click();
    await page.locator(`[data-individuals-item][title="${DATA}sheet-${n}/titleblock"]`).click();
    await page.locator('[data-individuals-detail] h4', { hasText: `Titleblock of sheet ${n}` }).waitFor();
  }

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    // No folder picker: the folder goes through the file input, as in the browsers that have none.
    await page.addInitScript(() => Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true }));
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('#openOntologyModal [data-explore-folder]').waitFor({ state: 'visible' });
  });

  afterAll(async () => {
    await browser?.close();
  });
  traceOnFailure(() => page.context());

  it('"Explore a folder…" adds every data file of the folder, lists them under it, skips the README, and says nothing of missing parts', async () => {
    expect(await page.locator('#openOntologyModal [data-explore-folder]').getAttribute('title')).toMatch(/nothing is uploaded/);

    await page.setInputFiles('#openOntologyModal [data-explore-folder-input]', RUN_DIR);

    await page.waitForFunction(() => document.getElementById('individualsPanelBtn')?.textContent === 'Individuals (26)');
    expect(await page.locator('[data-data-status]').innerText()).toBe("Added 4 data files from run-0001; 4 images kept for previews; 1 other file skipped; 1 image its data names isn't in the folder.");
    expect(await page.locator('[data-data-list] > li').allInnerTexts()).toEqual([
      expect.stringContaining('📁 run-0001 — 4 data files, 4 images'),
      expect.stringContaining('part-0001.nq.gz — 32 triples'),
      expect.stringContaining('part-0002.nq.gz — 16 triples'),
      expect.stringContaining('part-0003.nq.gz — 32 triples'),
      expect.stringContaining('run.ttl — 4 triples'),
    ]);
    expect(await page.locator('[data-data-parts]').isHidden()).toBe(true);
  });

  it("warns in the bottom bar of the image its data names that the folder doesn't hold, popped up on Windows only (#240)", async () => {
    const warning = page.locator('#ontologyIssuesPopup [data-status-notice^="folder-images:"]');
    expect(await warning.textContent()).toContain("run-0001: 1 image its data names isn't in the folder.");
    expect(await page.locator('#ontologyIssuesBtn').textContent()).toContain('warnings (');

    const onWindows = await page.evaluate(() => /Win/i.test(navigator.platform));
    expect(await page.locator('[data-notice-modal]').count()).toBe(onWindows ? 1 : 0);
    if (!onWindows) return;
    expect(await page.locator('[data-notice-modal] [data-notice-modal-mute]').count()).toBe(1);
    await page.click('[data-notice-modal-close]');
    expect(await page.locator('[data-notice-modal]').count()).toBe(0);
  });

  it("shows a titleblock's crop in its detail, through ADIRO's frame links, under a drawing path with & and a comma, and says when there is none", async () => {
    await showTitleblock(2);

    const image = page.locator('[data-individuals-detail] [data-individuals-linked-images] [data-individuals-image]');
    await page.waitForFunction(() => (document.querySelector('[data-individuals-detail] [data-individuals-linked-images] [data-individuals-image]') as HTMLImageElement | null)?.naturalWidth === 320);
    expect(await image.getAttribute('src')).toMatch(/^blob:/);

    await showTitleblock(4);
    expect(await page.locator('[data-individuals-detail] [data-individuals-image-missing]').innerText()).toContain('No file at this path');
  });

  it('gives a drawn titleblock its image for the tooltip in the graph', async () => {
    const id = `__individual__${DATA}sheet-1/titleblock`;
    await page.waitForFunction((nodeId) => (window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.get(nodeId) !== null, id);

    const images = await page.evaluate((nodeId) => (window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.get(nodeId).exampleImages as string[], id);

    expect(images).toEqual([expect.stringMatching(/^blob:/)]);
  });

  it('marks the result cells that name an image found, and shows the image while the pointer is over one', async () => {
    await page.click('#queryPanelBtn');
    await page.locator('[data-query-editor][data-editor="codemirror"] .cm-content').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('SELECT ?path WHERE { ?crop <https://w3id.org/adiro/adiro_provenance#storageLocation> ?path } ORDER BY ?path');
    await page.click('[data-query-run]');
    await page.locator('.query-results tbody tr').nth(4).waitFor();

    // Five paths, four images: sheet 4 has none.
    expect(await page.locator('[data-query-image]').count()).toBe(4);
    await page.locator('[data-query-image]').first().hover();
    await page.waitForFunction(() => (document.querySelector('[data-query-image] .query-image-preview img') as HTMLImageElement | null)?.naturalWidth === 320);
    expect(await page.locator('[data-query-image] .query-image-preview').first().isVisible()).toBe(true);
    await page.click('#individualsPanelBtn');
  });

  it('"Remove folder" takes out all its files; a part added on its own then shows the path with the hint to open the folder', async () => {
    await page.locator('[data-data-folder-remove]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-data-list] li').length === 0);

    await page.setInputFiles('[data-add-file-input]', join(RUN_DIR, 'part-0001.nq.gz'));
    await page.waitForFunction(() => document.querySelectorAll('[data-data-list] li').length === 1);
    await showTitleblock(1);

    expect(await page.locator('[data-individuals-detail] [data-individuals-image-missing]').innerText()).toContain("Open the data's folder (From a folder…)");
    expect(await page.locator('[data-individuals-detail] [data-individuals-linked-images] [data-individuals-image]').count()).toBe(0);
  });
});
