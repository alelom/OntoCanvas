/**
 * E2E for #98: in the Add Edge dialog, typing a relationship and clicking OK straight away must add the
 * edge. The dialog used to reveal the relationship's comment and cardinality sections only when the
 * Relationship field lost focus — i.e. on the mousedown of that click — which moved the OK button so the
 * mouseup (and the click) landed off it. A real mouse click is used on purpose: an in-page element.click()
 * never exposed the bug.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { openEditorWithTtl } from './testHelpers';

const TTL = `@prefix : <http://example.org/click#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/click> a owl:Ontology .
:Source a owl:Class ; rdfs:label "Source" .
:Target a owl:Class ; rdfs:label "Target" .
:relatesTo a owl:ObjectProperty ; rdfs:label "relates to" ;
  rdfs:comment "Links a source to a target; shown under the field once the relationship is chosen." .`;

describe('Add Edge: OK right after typing the relationship (#98)', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    await openEditorWithTtl(page, TTL);
  });

  afterAll(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
  });

  it('adds the edge on a real click, without leaving the field first', async () => {
    const edgeCount = () => page.evaluate(() => (window as any).__EDITOR_TEST__.getRawDataEdges().length as number);
    const before = await edgeCount();
    await page.evaluate(() => (window as any).__EDITOR_TEST__.showAddEdgeModalForTest('Source', 'Target'));
    await page.waitForFunction(
      () => getComputedStyle(document.getElementById('editEdgeModal')!).display !== 'none',
      undefined,
      { timeout: 5000 }
    );
    await page.locator('#editEdgeType').fill('relates');
    // The single match is picked once the debounced search has run: the field then shows its label.
    await page.waitForFunction(
      () => (document.getElementById('editEdgeType') as HTMLInputElement).value.toLowerCase().includes('relates to'),
      undefined,
      { timeout: 5000 }
    );
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('editEdgeType'); // still in the field
    await page.locator('#editEdgeConfirm').click();

    await expect.poll(edgeCount, { timeout: 5000 }).toBe(before + 1);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('editEdgeModal')!).display)).toBe('none');
  });
});
