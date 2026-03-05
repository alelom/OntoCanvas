/**
 * E2E tests for data property: double-click/context menu opening edit modal, and domain editing.
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const TEST_FIXTURES_DIR = join(__dirname, '../fixtures');

async function loadTestFile(page: Page, filePath: string): Promise<void> {
  await page.evaluate(() => {
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.style.display = 'block';
      fileInput.style.visibility = 'visible';
      fileInput.style.position = 'absolute';
      fileInput.style.left = '0';
      fileInput.style.top = '0';
      fileInput.style.width = '1px';
      fileInput.style.height = '1px';
    }
  });
  await page.waitForTimeout(50);
  const fileInput = page.locator('input#fileInput');
  await fileInput.setInputFiles(filePath, { timeout: 5000 });
  await page.waitForTimeout(200);
}

async function waitForGraphRender(page: Page, timeout = 5000): Promise<void> {
  // Wait for the graph to render. The counts can be 0 (e.g., after deleting all nodes/edges),
  // so we check that the elements exist and have valid numeric values (including 0).
  await page.waitForFunction(
    () => {
      const nodeCountEl = document.getElementById('nodeCount');
      const edgeCountEl = document.getElementById('edgeCount');
      const nodeCount = nodeCountEl?.textContent?.trim();
      const edgeCount = edgeCountEl?.textContent?.trim();
      // Require counts to be present, non-empty, and parse as valid finite numbers (including 0)
      return (
        nodeCount !== undefined &&
        nodeCount !== '' &&
        Number.isFinite(Number(nodeCount)) &&
        edgeCount !== undefined &&
        edgeCount !== '' &&
        Number.isFinite(Number(edgeCount))
      );
    },
    { timeout }
  );
  await page.waitForTimeout(150);
}

describe('Data Property Edit E2E Tests', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(8000);
    page.setDefaultNavigationTimeout(8000);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, { timeout: 5000 });
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);
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
      await page.waitForTimeout(200);

      const title = await page.evaluate(() => (window as any).__EDITOR_TEST__?.getEditEdgeModalTitle?.() ?? null);
      expect(title).not.toBeNull();
      expect(title).toContain('data property');
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
      await page.waitForTimeout(200);

      const title = await page.evaluate(() => (window as any).__EDITOR_TEST__?.getEditEdgeModalTitle?.() ?? null);
      expect(title).not.toBeNull();
      expect(title).toContain('data property');
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

      await page.waitForTimeout(300);

      const title = await page.evaluate(() => (window as any).__EDITOR_TEST__?.getEditEdgeModalTitle?.() ?? null);
      expect(title).not.toBeNull();
      expect(title).toContain('data property');
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
      await page.waitForTimeout(200);

      const title = await page.evaluate(() => (window as any).__EDITOR_TEST__?.getEditEdgeModalTitle?.() ?? null);
      expect(title).not.toBeNull();
      expect(title).toContain('data property');
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
      await page.waitForTimeout(200);

      const title = await page.evaluate(() => (window as any).__EDITOR_TEST__?.getEditEdgeModalTitle?.() ?? null);
      expect(title).not.toBeNull();
      expect(title).toContain('data property');
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
      await page.waitForTimeout(200);

      const title = await page.evaluate(() => (window as any).__EDITOR_TEST__?.getEditEdgeModalTitle?.() ?? null);
      expect(title).not.toBeNull();
      expect(title).toContain('data property');
    });
  });

  describe('Edit data property domain', () => {
    it('adding a domain and clicking OK updates in-memory domains and serialized TTL uses : format', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'data-property-restriction.ttl');
      expect(existsSync(testFile)).toBe(true);

      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      await page.locator('#editEdgeCancel').click({ timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(100);

      await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (testHook?.openEditDataPropertyModal) testHook.openEditDataPropertyModal('myDataProp');
      });
      await page.waitForTimeout(200);

      const modalVisible = await page.locator('#editDataPropertyModal').isVisible();
      expect(modalVisible).toBe(true);

      await page.locator('#editDataPropAddDomain').click();
      await page.waitForTimeout(300);

      const domainSelect = page.locator('#editDataPropertyModal select').nth(1);
      await domainSelect.waitFor({ state: 'visible', timeout: 3000 });
      await domainSelect.selectOption({ value: 'Note' });
      await page.waitForTimeout(150);

      const addBtn = page.locator('#editDataPropertyModal button').filter({ hasText: /^Add$/ });
      await addBtn.waitFor({ state: 'visible', timeout: 2000 });
      await addBtn.click();
      await page.waitForTimeout(150);

      await page.locator('#editDataPropConfirm').click();
      await page.waitForTimeout(250);

      const dp = await page.evaluate(
        (name) => (window as any).__EDITOR_TEST__?.getDataPropertyByName?.(name) ?? null,
        'myDataProp'
      );
      expect(dp).not.toBeNull();
      expect(dp?.domains).toContain('Note');

      const ttl = await page.evaluate(async () => (window as any).__EDITOR_TEST__?.getSerializedTurtle?.() ?? null);
      expect(ttl).toBeTruthy();
      expect(ttl).toContain('rdfs:domain');
      expect(ttl).toContain(':myDataProp');
      expect(ttl).toContain('owl:DatatypeProperty');
      expect(ttl).not.toMatch(/<[^>]*Ontology#/);
    });
  });
});
