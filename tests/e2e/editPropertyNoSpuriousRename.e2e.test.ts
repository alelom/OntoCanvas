/**
 * E2E regression test for issue #33.
 *
 * Opening the Edit object/data property modal for a camelCase-named property and pressing OK
 * without changing anything must NOT rename the term: the derived identifier previously
 * lowercased the whole first word (assertedBy -> assertedby), which the handler read as a
 * rename, rewrote the URI, and set hasUnsavedChanges. The data-property path additionally
 * moved the term into an external namespace.
 *
 * The modals are opened through the test hook (not by clicking list buttons) because the
 * list-button path is timing-flaky; the OK button itself is clicked so the real handler runs.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const FIXTURE = join(__dirname, '../fixtures/aec-provenance-typing-stubs.ttl');
const ADIRO_NS = 'https://w3id.org/adiro/aec_provenance#';

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
  await page.locator('input#fileInput').setInputFiles(filePath, { timeout: 5000 });
  await page.waitForTimeout(200);
}

async function waitForGraphRender(page: Page, timeout = 5000): Promise<void> {
  await page.waitForFunction(
    () => {
      const nodeCountEl = document.getElementById('nodeCount');
      const nodeCount = nodeCountEl?.textContent?.trim();
      return nodeCount !== undefined && nodeCount !== '' && Number.isFinite(Number(nodeCount));
    },
    { timeout }
  );
  await page.waitForTimeout(150);
}

describe('Edit property modal — OK with no changes does not rename (issue #33)', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    expect(existsSync(FIXTURE)).toBe(true);
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(5000);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, { timeout: 5000 });
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);
    await loadTestFile(page, FIXTURE);
    await waitForGraphRender(page);
    // Baseline: a freshly loaded file has nothing to save.
    await page.evaluate(() => (window as any).__EDITOR_TEST__?.setHasUnsavedChanges?.(false));
  });

  afterAll(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
  });

  it('object property assertedBy keeps its URI and stays saved-clean', async () => {
    const before = await page.evaluate(
      () => (window as any).__EDITOR_TEST__?.getObjectPropertyByName?.('assertedBy')?.uri ?? null
    );
    expect(before).toBe(`${ADIRO_NS}assertedBy`);

    await page.evaluate(() => (window as any).__EDITOR_TEST__?.openEditObjectPropertyModal?.('assertedBy'));
    await page.locator('#editRelationshipTypeModal').waitFor({ state: 'visible', timeout: 3000 });
    await page.locator('#editRelTypeConfirm').click();
    await page.waitForTimeout(200);

    const after = await page.evaluate(
      () => (window as any).__EDITOR_TEST__?.getObjectPropertyByName?.('assertedBy')?.uri ?? null
    );
    expect(after, 'assertedBy must not be renamed to assertedby').toBe(`${ADIRO_NS}assertedBy`);

    const state = await page.evaluate(() => (window as any).__EDITOR_TEST__?.getSaveButtonState?.());
    expect(state?.hasUnsavedChanges, 'pressing OK with no changes must not mark unsaved').toBe(false);
  });

  it('data property capturedCaption keeps its URI (case and namespace) and stays saved-clean', async () => {
    const before = await page.evaluate(
      () => (window as any).__EDITOR_TEST__?.getDataPropertyByName?.('capturedCaption')?.uri ?? null
    );
    expect(before).toBe(`${ADIRO_NS}capturedCaption`);

    await page.evaluate(() => (window as any).__EDITOR_TEST__?.openEditDataPropertyModal?.('capturedCaption'));
    await page.locator('#editDataPropertyModal').waitFor({ state: 'visible', timeout: 3000 });
    await page.locator('#editDataPropConfirm').click();
    await page.waitForTimeout(200);

    const after = await page.evaluate(
      () => (window as any).__EDITOR_TEST__?.getDataPropertyByName?.('capturedCaption')?.uri ?? null
    );
    // Must not become adiro#capturedcaption (case) or prov#capturedcaption (namespace).
    expect(after, 'capturedCaption must not be renamed or moved to another namespace').toBe(
      `${ADIRO_NS}capturedCaption`
    );

    const state = await page.evaluate(() => (window as any).__EDITOR_TEST__?.getSaveButtonState?.());
    expect(state?.hasUnsavedChanges, 'pressing OK with no changes must not mark unsaved').toBe(false);
  });
});
