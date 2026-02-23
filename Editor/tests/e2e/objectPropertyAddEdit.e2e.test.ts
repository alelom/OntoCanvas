/**
 * E2E tests for Add Object Property (list update, duplicate identifier) and Edit Object Property (derived IRI display).
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
  await page.waitForFunction(
    () => {
      const nodeCountEl = document.getElementById('nodeCount');
      const nodeCount = nodeCountEl?.textContent?.trim();
      return nodeCount !== undefined && nodeCount !== '';
    },
    { timeout }
  );
  await page.waitForTimeout(150);
}

describe('Object Property Add/Edit E2E Tests', () => {
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

  describe('Add Object Property – list update', () => {
    it('adding a new object property shows it in the list and serialized TTL uses : format', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'object-property-add.ttl');
      expect(existsSync(testFile)).toBe(true);

      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (testHook?.openAddObjectPropertyModal) testHook.openAddObjectPropertyModal();
      });
      await page.waitForTimeout(150);

      const addModalVisible = await page.evaluate(() => {
        const modal = document.getElementById('addRelationshipTypeModal');
        return modal && (modal as HTMLElement).style.display !== 'none';
      });
      expect(addModalVisible).toBe(true);

      await page.locator('#addRelTypeLabel').fill('references');
      await page.waitForTimeout(100);

      await page.locator('#addRelTypeConfirm').click();
      await page.waitForTimeout(300);

      const listText = await page.evaluate(() => (window as any).__EDITOR_TEST__?.getObjectPropertiesListText?.() ?? '');
      expect(listText).toContain('references');
      expect(listText).toContain('contains');

      const ttl = await page.evaluate(() => (window as any).__EDITOR_TEST__?.getSerializedTurtle?.());
      expect(ttl).not.toBeNull();
      expect(ttl).toContain('references');
      expect(ttl).toContain('ObjectProperty');
      expect(ttl).not.toMatch(/<[^>]*Ontology#/);
    });
  });

  describe('Add Object Property – duplicate identifier', () => {
    it('duplicate derived identifier disables OK or shows error', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'object-property-add.ttl');
      expect(existsSync(testFile)).toBe(true);

      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (testHook?.openAddObjectPropertyModal) testHook.openAddObjectPropertyModal();
      });
      await page.waitForTimeout(150);

      await page.locator('#addRelTypeLabel').fill('contains');
      await page.waitForTimeout(200);

      const state = await page.evaluate(() => (window as any).__EDITOR_TEST__?.getAddObjectPropertyModalState?.());
      expect(state).toBeDefined();
      expect(state.okDisabled === true || (state.validationText && state.validationText.toLowerCase().includes('already exists'))).toBe(true);
    });
  });

  describe('Edit Object Property – derived IRI', () => {
    it('Edit Object Property identifier does not contain #Ontology#', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'object-property-edit-iri.ttl');
      expect(existsSync(testFile)).toBe(true);

      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (testHook?.openEditObjectPropertyModal) testHook.openEditObjectPropertyModal('contains');
      });
      await page.waitForTimeout(200);

      // Identifier is now an input field, so read its value directly
      const identifierText = await page.evaluate(() => {
        const identifierEl = document.getElementById('editRelTypeIdentifier') as HTMLInputElement;
        return identifierEl?.value || '';
      });
      expect(identifierText).not.toBeNull();
      expect(identifierText).not.toBe('');
      expect(identifierText).not.toContain('Ontology#');
      expect(identifierText).toContain('contains');
      expect(identifierText).toMatch(/http:\/\//);
    });
  });
});
