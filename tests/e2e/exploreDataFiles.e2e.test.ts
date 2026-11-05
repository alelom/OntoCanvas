/**
 * E2E: starting from data files with no ontology (#234), and the notice about numbered parts (#225). The start screen's
 * "Explore data files…" and a drop on it open an empty workspace ontology and add the files as data; opening an ontology
 * afterwards clears the data. Files come from examples/datasets/run-parts; there is no network.
 */
import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { EDITOR_URL } from './editorUrl';
import { traceOnFailure } from './traceOnFailure';

const DIR = join(__dirname, '../../examples/datasets/run-parts');
const PART = (n: 1 | 2) => join(DIR, `part-000${n}.nq.gz`);
const button = () => page.evaluate(() => document.getElementById('individualsPanelBtn')?.textContent ?? null);

let browser: Browser;
let page: Page;

describe('starting from data files', () => {
  beforeAll(async () => {
    browser = await launchBrowser();
  });
  beforeEach(async () => {
    await page?.close();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('#openOntologyModal [data-explore-data]').waitFor({ state: 'visible' });
  });
  afterAll(async () => {
    await browser?.close();
  });
  traceOnFailure(() => page.context());

  it('"Explore data files…" opens an empty workspace and adds the files picked, with no ontology to open first', async () => {
    await page.setInputFiles('#openOntologyModal [data-explore-data-input]', [PART(1), PART(2)]);

    await page.waitForFunction(() => document.getElementById('individualsPanelBtn')?.textContent === 'Individuals (33)');
    expect(await page.locator('#openOntologyModal').isHidden()).toBe(true);
    expect(await page.locator('[data-data-list] li').allInnerTexts()).toEqual([expect.stringContaining('part-0001.nq.gz'), expect.stringContaining('part-0002.nq.gz')]);
    // In the bottom bar's notes, which it replaces the "no classes" note in.
    // Beside it, the note that no ontology was found at the namespaces of the data's classes (#239): the example names none.
    await page.waitForFunction(() => (document.getElementById('ontologyIssuesBtn')?.textContent ?? '').includes('notes (2)'));
    expect(await page.locator('#ontologyIssuesPopup [data-status-notice="data-ontologies"]').textContent()).toContain('No ontology could be read at the namespaces');
    expect(await page.locator('#ontologyIssuesPopup [data-status-notice="no-classes"]').count()).toBe(0);
    expect(await page.locator('#ontologyIssuesPopup [data-status-notice="workspace"]').textContent()).toMatch(/no ontology/i);
    // Parts 1 and 2 with no gap: the softer notice.
    expect(await page.locator('[data-data-parts]').innerText()).toContain('There may be more');
    expect(await page.locator('[data-data-parts]').getAttribute('class')).not.toContain('strong');
  });

  it('takes files dropped on the "Explore data files" box the same way, and says which numbered part is missing (#225)', async () => {
    const transfer = await page.evaluateHandle((data) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(data)], 'part-0002.nq.gz'));
      return dt;
    }, [...readFileSync(PART(2))]);

    await page.dispatchEvent('#openOntologyModal .explore-data-start', 'dragover', { dataTransfer: transfer });
    expect(await page.locator('#openOntologyModal .explore-data-start').getAttribute('class')).toContain('data-drop-active');
    await page.dispatchEvent('#openOntologyModal .explore-data-start', 'drop', { dataTransfer: transfer });

    await page.waitForFunction(() => document.querySelectorAll('[data-data-list] li').length === 1);
    expect(await page.locator('[data-data-parts]').innerText()).toContain('part 1, and any after 2, may be missing');
    expect(await page.locator('[data-data-parts]').getAttribute('class')).toContain('strong');
  });

  it('does not take files dropped elsewhere on the dialog, which is for opening an ontology (#238 review)', async () => {
    const transfer = await page.evaluateHandle(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['@prefix : <http://example.org/o#> .'], 'ontology.ttl'));
      return dt;
    });

    await page.dispatchEvent('#openOntologyModal h2', 'drop', { dataTransfer: transfer });

    expect(await page.locator('#openOntologyModal').isVisible()).toBe(true);
    expect(await page.evaluate(() => (window as any).__EDITOR_TEST__.getNodeIds?.().length ?? 0)).toBe(0);
    expect(await page.locator('[data-data-list] li').count()).toBe(0);
  });

  it('clears the data when an ontology is opened afterwards', async () => {
    await page.setInputFiles('#openOntologyModal [data-explore-data-input]', [PART(1)]);
    await page.waitForFunction(() => document.getElementById('individualsPanelBtn')?.textContent === 'Individuals (18)');

    await page.evaluate((ttl) => (window as any).__EDITOR_TEST__.loadTtlDirectly(ttl, 'vocabulary.ttl'), readFileSync(join(DIR, 'vocabulary.ttl'), 'utf8'));

    await page.waitForFunction(() => document.getElementById('individualsPanelBtn')?.textContent === 'Add individuals');
    expect(await page.locator('[data-data-list] li').count()).toBe(0);
    expect(await button()).toBe('Add individuals');
  });
});
