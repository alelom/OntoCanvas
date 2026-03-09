/**
 * E2E tests for ontologies with no classes.
 * Verifies that warning appears and edit controls (Add node/Add edge) remain functional.
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
  await page.waitForTimeout(500);
}

async function waitForWarningOrGraph(page: Page, timeout = 5000): Promise<'warning' | 'graph'> {
  try {
    await page.waitForFunction(
      () => {
        const warningMsg = document.getElementById('warningMsg');
        const vizControls = document.getElementById('vizControls');
        const hasWarning = warningMsg && warningMsg.style.display !== 'none';
        const hasGraph = vizControls && vizControls.style.display !== 'none';
        return hasWarning || hasGraph;
      },
      { timeout }
    );
    
    const warningVisible = await page.evaluate(() => {
      const el = document.getElementById('warningMsg');
      return el && el.style.display !== 'none';
    });
    
    if (warningVisible) {
      return 'warning';
    }
    return 'graph';
  } catch {
    return 'warning'; // Timeout likely means warning
  }
}

describe('No classes ontology E2E', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
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
  });

  afterAll(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
  });

  it('shows warning when ontology has no classes', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'no-classes-ontology.ttl');
    expect(existsSync(testFile)).toBe(true);

    await loadTestFile(page, testFile);
    
    const result = await waitForWarningOrGraph(page, 10000);
    expect(result).toBe('warning');
    
    const warningText = await page.evaluate(() => {
      const el = document.getElementById('warningMsgText');
      return el?.textContent || '';
    });
    
    expect(warningText).toContain('no classes');
    expect(warningText).toContain('canvas is empty');
  }, 10000);

  it('shows vizControls (Add node/Add edge buttons) when ontology has no classes', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'no-classes-ontology.ttl');
    expect(existsSync(testFile)).toBe(true);

    await loadTestFile(page, testFile);
    await waitForWarningOrGraph(page, 10000);
    
    // Wait a bit for everything to settle
    await page.waitForTimeout(500);
    
    const vizControlsVisible = await page.evaluate(() => {
      const el = document.getElementById('vizControls');
      return el && el.style.display !== 'none';
    });
    
    expect(vizControlsVisible).toBe(true);
    
    // Check that Add node button is visible
    const addNodeButtonVisible = await page.evaluate(() => {
      const el = document.querySelector('.vis-add');
      return el && (el as HTMLElement).style.display !== 'none';
    });
    
    expect(addNodeButtonVisible).toBe(true);
  }, 10000);

  it('allows double-clicking canvas to open Add node modal when ontology has no classes', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'no-classes-ontology.ttl');
    expect(existsSync(testFile)).toBe(true);

    await loadTestFile(page, testFile);
    await waitForWarningOrGraph(page, 10000);
    await page.waitForTimeout(500);
    
    // Close any open modals first
    await page.evaluate(() => {
      const modal = document.getElementById('addNodeModal');
      if (modal) (modal as HTMLElement).style.display = 'none';
    });
    await page.waitForTimeout(200);
    
    // Double-click on the canvas
    await page.locator('#network').dblclick({ position: { x: 400, y: 300 } });
    await page.waitForTimeout(300);
    
    // Check if Add node modal is visible
    const addModalVisible = await page.evaluate(() => {
      const modal = document.getElementById('addNodeModal');
      return modal && (modal as HTMLElement).style.display !== 'none';
    });
    
    expect(addModalVisible).toBe(true);
  }, 10000);

  it('allows clicking Add node button then canvas to open Add node modal when ontology has no classes', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'no-classes-ontology.ttl');
    expect(existsSync(testFile)).toBe(true);

    await loadTestFile(page, testFile);
    await waitForWarningOrGraph(page, 10000);
    await page.waitForTimeout(500);
    
    // Close any open modals first
    await page.evaluate(() => {
      const modal = document.getElementById('addNodeModal');
      if (modal) (modal as HTMLElement).style.display = 'none';
    });
    await page.waitForTimeout(200);
    
    // Verify Add node button is visible
    const addButtonVisible = await page.evaluate(() => {
      const btn = document.querySelector('.vis-add');
      return btn && (btn as HTMLElement).style.display !== 'none';
    });
    expect(addButtonVisible).toBe(true);
    
    // Click Add node button - this should set addNodeMode
    await page.locator('.vis-add').click({ timeout: 3000 });
    await page.waitForTimeout(300);
    
    // Click on canvas - this should trigger the Add node modal
    // Use force: true to ensure click goes through even if something is overlaying
    await page.locator('#network').click({ position: { x: 400, y: 300 }, force: true });
    await page.waitForTimeout(500);
    
    // Check if Add node modal is visible
    const addModalVisible = await page.evaluate(() => {
      const modal = document.getElementById('addNodeModal');
      return modal && (modal as HTMLElement).style.display !== 'none';
    });
    
    expect(addModalVisible).toBe(true);
  }, 10000);
});
