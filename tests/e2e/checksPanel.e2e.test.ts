/**
 * E2E: a library of checks from a manifest (#230, #231). The example of examples/checks, opened with ?checks=: the Checks tab
 * lists its shapes, Run checks reports the failures by shape and opens the card of a reading, and the Query tab lists its saved
 * queries, one of which runs. The addresses are answered by routes from the example's own files (no real network).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { EDITOR_URL } from './editorUrl';

const EXAMPLE = join(__dirname, '../../examples/checks');
const SITE = 'https://e2e-checks.test/checks/';

describe('the library of checks', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    await page.route(/e2e-checks\.test\/checks\//, (route) => {
      const path = new URL(route.request().url()).pathname.replace('/checks/', '');
      try {
        route.fulfill({ status: 200, contentType: 'text/plain', body: readFileSync(join(EXAMPLE, path), 'utf8'), headers: { 'access-control-allow-origin': '*' } });
      } catch {
        route.fulfill({ status: 404, body: '' });
      }
    });
    const at = (file: string) => encodeURIComponent(SITE + file);
    await page.goto(`${EDITOR_URL}?onto=${at('readings.ttl')}&data=${at('readings-data.ttl')}&checks=${at('manifest.json')}`, { waitUntil: 'domcontentloaded' });
    // The checks are loaded once the ontology and its data are: their tab is the one left open.
    await page.waitForSelector('[data-checks-shapes-file]');
  });

  afterAll(async () => {
    await browser?.close();
  });

  it('runs the shapes of the manifest and reports the failures by shape, the SPARQL-based shape not checked', async () => {
    expect(await page.locator('[data-checks-shapes-file]').allInnerTexts()).toEqual([
      'readings.shacl.ttl 2 shapes (Readings checks) Remove',
      'no-web-addresses.shacl.ttl 1 shape (Readings checks) Remove',
    ]);

    await page.click('[data-checks-run]');
    await page.waitForFunction(() => /checked in/.test(document.querySelector('[data-checks-status]')?.textContent ?? ''));

    expect(await page.locator('[data-checks-status]').innerText()).toMatch(/^4 violations, 1 warning: 2 shapes checked in \d+ ms; 1 shape not checked \(below\)\.$/);
    expect(await page.locator('[data-checks-shape] > summary').allInnerTexts()).toEqual(['shapes:Reading (2 violations, 1 warning)', 'shapes:TextOrOutcome (2 violations)']);
    expect(await page.locator('[data-checks-not-checked]').innerText()).toContain('shapes:NoWebAddresses');
  });

  it('opens the card of a reading from the report', async () => {
    await page.locator('[data-checks-result] [data-checks-open]', { hasText: ':reading4' }).first().click();

    await page.waitForFunction(() => document.querySelector('[data-individuals-detail] h4')?.textContent === 'Reading 4');
  });

  it('lists the saved queries in the Query tab, and runs the one picked', async () => {
    await page.click('#queryPanelBtn');
    const saved = page.locator('[data-query-saved]');
    expect(await saved.locator('option').allInnerTexts()).toEqual(['Saved queries (2)', 'The readings of each region, with what they read', 'The readings with no text']);

    await saved.selectOption('1');
    await page.click('[data-query-run]');
    await page.waitForSelector('[data-query-result] table');

    // The readings with no text: :reading2, :reading4 and :reading6.
    expect(await page.locator('[data-query-result] tbody tr').count()).toBe(3);
  });
});
