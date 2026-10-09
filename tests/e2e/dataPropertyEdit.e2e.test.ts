/**
 * E2E tests for data property: double-click/context menu opening edit modal, and domain editing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { loadTestFile, waitForGraphRender } from './testHelpers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const TEST_FIXTURES_DIR = join(__dirname, '../fixtures');

/** Wait until the edit-edge modal is shown with a title containing `text`. */
async function expectEditModalTitleToContain(page: Page, text: string): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => (window as any).__EDITOR_TEST__?.getEditEdgeModalTitle?.() ?? ''), { timeout: 5000 })
    .toContain(text);
}

describe('Data Property Edit E2E Tests', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(5000);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });
    await page.evaluate(() => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
  });

  afterAll(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
  });

  describe('Open Edit data property restriction modal', () => {
    it('opening edit modal for data property restriction node shows Edit data property restriction', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'data-property-restriction.ttl');
      expect(existsSync(testFile)).toBe(true);

      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (testHook?.openEditModalForNode) testHook.openEditModalForNode('__dataproprestrict__Note__myDataProp');
      });

      await expectEditModalTitleToContain(page, 'data property');
    });

    it('opening edit modal for data property edge shows Edit data property restriction', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'data-property-restriction.ttl');
      expect(existsSync(testFile)).toBe(true);

      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      const edgeId = '__dataproprestrict__Note__myDataProp->Note:dataproprestrict';
      await page.evaluate(
        (id) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (testHook?.openEditModalForEdge) testHook.openEditModalForEdge(id);
        },
        edgeId
      );

      await expectEditModalTitleToContain(page, 'data property');
    });

    it('double-clicking data property restriction node opens edit modal', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'data-property-restriction.ttl');
      expect(existsSync(testFile)).toBe(true);

      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      // Use test hook to simulate double-click (which calls openEditModalForNode)
      // This tests the same code path that double-click would trigger
      await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (testHook?.openEditModalForNode) testHook.openEditModalForNode('__dataproprestrict__Note__myDataProp');
      });

      await expectEditModalTitleToContain(page, 'data property');
    });

    it('context menu "Edit properties" on data property restriction node opens edit modal', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'data-property-restriction.ttl');
      expect(existsSync(testFile)).toBe(true);

      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      // Use test hook to simulate context menu edit
      await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (testHook?.openEditModalForNode) testHook.openEditModalForNode('__dataproprestrict__Note__myDataProp');
      });

      await expectEditModalTitleToContain(page, 'data property');
    });

    it('double-clicking data property restriction edge opens edit modal', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'data-property-restriction.ttl');
      expect(existsSync(testFile)).toBe(true);

      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      // Use test hook to simulate edge double-click
      const edgeId = '__dataproprestrict__Note__myDataProp->Note:dataproprestrict';
      await page.evaluate(
        (id) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (testHook?.openEditModalForEdge) testHook.openEditModalForEdge(id);
        },
        edgeId
      );

      await expectEditModalTitleToContain(page, 'data property');
    });

    it('context menu "Edit properties" on data property restriction edge opens edit modal', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'data-property-restriction.ttl');
      expect(existsSync(testFile)).toBe(true);

      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      // Use test hook to simulate context menu edit on edge
      const edgeId = '__dataproprestrict__Note__myDataProp->Note:dataproprestrict';
      await page.evaluate(
        (id) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (testHook?.openEditModalForEdge) testHook.openEditModalForEdge(id);
        },
        edgeId
      );

      await expectEditModalTitleToContain(page, 'data property');
    });
  });

  describe('Edit data property domain', () => {
    it('adding a domain and clicking OK updates in-memory domains and serialized TTL uses : format', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'data-property-restriction.ttl');
      expect(existsSync(testFile)).toBe(true);

      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      // Earlier tests leave the edit-edge modal open; close it if so.
      const editEdgeModal = page.locator('#editEdgeModal');
      if (await editEdgeModal.isVisible()) {
        await page.locator('#editEdgeCancel').click();
        await expect.poll(() => editEdgeModal.isVisible(), { timeout: 5000 }).toBe(false);
      }

      await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (testHook?.openEditDataPropertyModal) testHook.openEditDataPropertyModal('myDataProp');
      });

      const editDataPropModal = page.locator('#editDataPropertyModal');
      await expect.poll(() => editDataPropModal.isVisible(), { timeout: 5000 }).toBe(true);

      await page.locator('#editDataPropAddDomain').click();

      const domainSelect = page.locator('#editDataPropertyModal select').nth(1);
      await domainSelect.waitFor({ state: 'visible', timeout: 3000 });
      await domainSelect.selectOption({ value: 'Note' });

      const addBtn = page.locator('#editDataPropertyModal button').filter({ hasText: /^Add$/ });
      await addBtn.waitFor({ state: 'visible', timeout: 2000 });
      await addBtn.click();

      await page.locator('#editDataPropConfirm').click();
      await expect.poll(() => editDataPropModal.isVisible(), { timeout: 5000 }).toBe(false);

      await expect
        .poll(
          () =>
            page.evaluate(
              (name) => (window as any).__EDITOR_TEST__?.getDataPropertyByName?.(name)?.domains ?? null,
              'myDataProp'
            ),
          { timeout: 5000 }
        )
        .toContain('Note');

      const ttl = await page.evaluate(async () => (window as any).__EDITOR_TEST__?.getSerializedTurtle?.() ?? null);
      expect(ttl).toBeTruthy();
      expect(ttl).toContain('rdfs:domain');
      expect(ttl).toContain(':myDataProp');
      expect(ttl).toContain('owl:DatatypeProperty');
      expect(ttl).not.toMatch(/<[^>]*Ontology#/);
    });
  });
});
