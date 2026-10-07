/**
 * E2E for #58: edges drawn from a class expression in a property's domain or range (here hasOrientation,
 * domain Section ∪ Detail) are read-only. Writing one back treated it as a single rdfs:domain/rdfs:range
 * pair: deleting it removed the range every member shares, and editing it added an rdfs:domain beside the
 * union, turning OR into AND. So the Edit-edge form is locked and deleting the edge alone is refused;
 * deleting a member class drops only its own edge and leaves the property's range alone.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium, type Browser, type Page } from 'playwright';

const EDITOR_URL = 'http://localhost:5173/';
const TTL = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../fixtures/unionDomain.ttl'), 'utf-8');
const SECTION_EDGE = 'Section->OrientationValue:hasOrientation';
const DETAIL_EDGE = 'Detail->OrientationValue:hasOrientation';

describe('Read-only class-expression edges E2E (#58)', () => {
  let browser: Browser;
  let page: Page;

  const edgeIds = () => page.evaluate(() => (window as any).__EDITOR_TEST__.getRawDataEdges().map((e: any) => `${e.from}->${e.to}:${e.type}`));
  const modalState = () =>
    page.evaluate(() => ({
      open: (document.getElementById('editEdgeModal') as HTMLElement).style.display !== 'none',
      confirmDisabled: (document.getElementById('editEdgeConfirm') as HTMLButtonElement).disabled,
      toDisabled: (document.getElementById('editEdgeTo') as HTMLSelectElement).disabled,
      notice: document.getElementById('editEdgeClassExpressionNotice')?.textContent ?? '',
    }));
  /** The property's rdfs:range and rdfs:domain object kinds, from the live store. */
  const propertyAxioms = () =>
    page.evaluate(() => {
      const hook = (window as any).__EDITOR_TEST__;
      const P = 'http://example.org/o#hasOrientation';
      const kinds = (pred: string) => hook.getQuads(P, pred).map((q: { objectType: string }) => q.objectType);
      return {
        ranges: kinds('http://www.w3.org/2000/01/rdf-schema#range'),
        domains: kinds('http://www.w3.org/2000/01/rdf-schema#domain'),
      };
    });

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__?.loadTtlDirectly !== undefined, { timeout: 5000 });
    await page.evaluate(() => (window as any).__EDITOR_TEST__?.hideOpenOntologyModal?.());
    await page.evaluate((t) => (window as any).__EDITOR_TEST__.loadTtlDirectly(t), TTL);
    await page.waitForFunction(() => ((window as any).__EDITOR_TEST__?.getRawDataEdges?.() ?? []).length > 0, { timeout: 5000 });
    await page.evaluate(() => (window as any).__EDITOR_TEST__?.hideOpenOntologyModal?.());
    await page.keyboard.press('Escape');
  });

  afterAll(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
  });

  it('starts with both union edges, one rdfs:range and the union as the only rdfs:domain', async () => {
    expect(await edgeIds()).toEqual(expect.arrayContaining([SECTION_EDGE, DETAIL_EDGE]));
    expect(await propertyAxioms()).toEqual({ ranges: ['NamedNode'], domains: ['BlankNode'] });
  });

  it('locks the Edit-edge form and explains the expression', async () => {
    await page.evaluate((id) => (window as any).__EDITOR_TEST__.editEdge(id), SECTION_EDGE);
    await expect.poll(modalState, { timeout: 5000 }).toMatchObject({ open: true, confirmDisabled: true, toDisabled: true });
    expect((await modalState()).notice).toContain('read-only');
    await page.click('#editEdgeCancel');
  });

  it('refuses to delete the edge on its own, leaving the ontology unchanged', async () => {
    let message = '';
    page.once('dialog', async (d) => {
      message = d.message();
      await d.accept();
    });
    await page.evaluate((id) => {
      const hook = (window as any).__EDITOR_TEST__;
      hook.selectEdgeById(id);
      hook.performDelete();
    }, SECTION_EDGE);
    await expect.poll(() => message, { timeout: 5000 }).toContain("can't be deleted in the editor yet");
    expect(await edgeIds()).toEqual(expect.arrayContaining([SECTION_EDGE, DETAIL_EDGE]));
    expect(await propertyAxioms()).toEqual({ ranges: ['NamedNode'], domains: ['BlankNode'] });
  });

  it("deleting a member class drops only that class's edge and keeps the shared range", async () => {
    await page.evaluate(() => {
      const hook = (window as any).__EDITOR_TEST__;
      hook.selectNodeById('Section');
      hook.performDelete();
    });
    await expect.poll(edgeIds, { timeout: 5000 }).not.toContain(SECTION_EDGE);
    expect(await edgeIds()).toContain(DETAIL_EDGE);
    expect(await propertyAxioms()).toEqual({ ranges: ['NamedNode'], domains: ['BlankNode'] });
  });
});
