/**
 * E2E: opening a job folder, a tree with a folder per run (#251), with examples/datasets/adiro-job/job. The browser's folder
 * picker cannot be driven by a test, so the page is given none and the folder goes through the file input (`webkitdirectory`),
 * as in Firefox and Safari; the listing, the loading and the numbered-part check are unit-tested on the same files. There is no
 * network: the ADIRO modules the runs name are not reached.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { EDITOR_URL } from './editorUrl';
import { traceOnFailure } from './traceOnFailure';

const JOB_DIR = join(__dirname, '../../examples/datasets/adiro-job/job');

describe('a job folder of several runs', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    await page.addInitScript(() => Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true }));
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('#openOntologyModal [data-explore-folder]').waitFor({ state: 'visible' });
    await page.setInputFiles('#openOntologyModal [data-explore-folder-input]', JOB_DIR);
    await page.locator('[data-data-status]', { hasText: 'Added 4 data files from job' }).waitFor();
  });

  afterAll(async () => {
    await browser?.close();
  });
  traceOnFailure(() => page.context());

  it('adds every part of every run and of the compacted folder as a source of its own, with no word of missing parts', async () => {
    expect(await page.locator('[data-data-status]').innerText()).toBe('Added 4 data files from job; 1 image kept for previews; 2 other files skipped.');
    expect(await page.locator('[data-data-list] > li').allInnerTexts()).toEqual([
      expect.stringContaining('📁 job — 4 data files, 1 image'),
      expect.stringContaining('compacted/part-0001.nq.gz — 51 triples'),
      expect.stringContaining('runs/run-a/part-0001.nq.gz — 28 triples'),
      expect.stringContaining('runs/run-a/part-0002.nq.gz — 23 triples'),
      expect.stringContaining('runs/run-b/part-0001.nq.gz — 51 triples'),
    ]);
    expect(await page.locator('[data-data-parts]').isHidden()).toBe(true);
  });

  it('lists the named graph of each run', async () => {
    expect(await page.locator('[data-data-graph]').allInnerTexts()).toEqual(['Run run-a — 102 quads', 'Run run-b — 51 quads']);
  });

  it("lists the job's individuals by class, each once whatever the sources that hold it", async () => {
    // 2 runs x (2 sheets x (file, page, drawing, titleblock, box, 2 assertions) + the run's activity), from run-a's quads held twice.
    await page.waitForFunction(() => document.getElementById('individualsPanelBtn')?.textContent === 'Individuals (30)');
  });
});
