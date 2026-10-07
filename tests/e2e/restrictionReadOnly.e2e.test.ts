/**
 * E2E for #63: restriction kinds the editor can't write back (∀ only, ∋ value, ⟲ self, unqualified
 * cardinality) are read-only — the Edit-edge modal explains them and locks the form, and deleting the
 * edge on its own is refused — while ∃ / qualified restrictions stay editable. Deleting the class still
 * takes its read-only restrictions with it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium, type Browser, type Page } from 'playwright';

const EDITOR_URL = 'http://localhost:5173/';
const TTL = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../fixtures/restrictionKinds.ttl'), 'utf-8');

describe('Read-only restriction kinds E2E (#63)', () => {
  let browser: Browser;
  let page: Page;

  const edgeIds = () => page.evaluate(() => (window as any).__EDITOR_TEST__.getRawDataEdges().map((e: any) => `${e.from}->${e.to}:${e.type}`));
  const modalState = () =>
    page.evaluate(() => ({
      open: (document.getElementById('editEdgeModal') as HTMLElement).style.display !== 'none',
      confirmDisabled: (document.getElementById('editEdgeConfirm') as HTMLButtonElement).disabled,
      notice: document.getElementById('editEdgeRestrictionNotice')?.textContent ?? '',
    }));

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__?.loadTtlDirectly !== undefined, { timeout: 5000 });
    await page.evaluate(() => (window as any).__EDITOR_TEST__?.hideOpenOntologyModal?.());
    await page.evaluate((t) => (window as any).__EDITOR_TEST__.loadTtlDirectly(t), TTL);
    await page.waitForFunction(() => ((window as any).__EDITOR_TEST__?.getRawDataEdges?.() ?? []).length > 0, { timeout: 5000 });
    // The start-up "Open ontology" dialog can still cover the page after loading; close it (as other E2E tests do).
    await page.evaluate(() => (window as any).__EDITOR_TEST__?.hideOpenOntologyModal?.());
    await page.keyboard.press('Escape');
  });

  afterAll(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
  });

  it('locks the Edit-edge form for a ∀ restriction and explains it', async () => {
    await page.evaluate(() => (window as any).__EDITOR_TEST__.editEdge('Building->Floor:hasFloor'));
    await expect.poll(modalState).toMatchObject({ open: true, confirmDisabled: true });
    expect((await modalState()).notice).toContain('∀ only: every hasFloor of a Building is a Floor.');
    await page.click('#editEdgeCancel');
  });

  it('keeps a qualified-cardinality restriction editable, with its detail shown', async () => {
    await page.evaluate(() => (window as any).__EDITOR_TEST__.editEdge('DrawingSet->Sheet:contains'));
    await expect.poll(modalState).toMatchObject({ open: true, confirmDisabled: false });
    expect((await modalState()).notice).toContain('Cardinality: every DrawingSet has [1..*] contains values that are a Sheet.');
    await page.click('#editEdgeCancel');
  });

  it('refuses to delete a ∀ edge on its own, with a message', async () => {
    let message = '';
    page.once('dialog', async (d) => {
      message = d.message();
      await d.accept();
    });
    await page.evaluate(() => {
      const hook = (window as any).__EDITOR_TEST__;
      hook.selectEdgeById('Building->Floor:hasFloor');
      hook.performDelete();
    });
    await expect.poll(() => message).toContain("can't be deleted in the editor yet");
    expect(await edgeIds()).toContain('Building->Floor:hasFloor');
  });

  it('removes the ∀ restriction when its class is deleted', async () => {
    await page.evaluate(() => {
      const hook = (window as any).__EDITOR_TEST__;
      hook.selectNodeById('Building');
      hook.performDelete();
    });
    await expect.poll(edgeIds).not.toContain('Building->Floor:hasFloor');
  });
});
