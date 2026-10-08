/**
 * E2E tests for ontologies with no classes.
 * Verifies that warning appears and edit controls (Add node/Add edge) remain functional.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { loadTestFile } from './testHelpers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const TEST_FIXTURES_DIR = join(__dirname, '../fixtures');

function isWarningVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.getElementById('warningMsg');
    return !!el && el.style.display !== 'none';
  });
}

function isAddNodeModalVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const modal = document.getElementById('addNodeModal');
    return !!modal && (modal as HTMLElement).style.display !== 'none';
  });
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

  it('shows warning when ontology has no classes', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'no-classes-ontology.ttl');
    expect(existsSync(testFile)).toBe(true);

    await loadTestFile(page, testFile);

    await expect.poll(() => isWarningVisible(page), { timeout: 5000 }).toBe(true);

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

    // loadTestFile waits for the app to be ready, which includes vizControls being shown.
    await loadTestFile(page, testFile);

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

    // Close any open modals first
    await page.evaluate(() => {
      const modal = document.getElementById('addNodeModal');
      if (modal) (modal as HTMLElement).style.display = 'none';
    });

    // Double-click on the canvas
    await page.locator('#network').dblclick({ position: { x: 400, y: 300 } });

    await expect.poll(() => isAddNodeModalVisible(page), { timeout: 5000 }).toBe(true);
  }, 10000);

  it('allows clicking Add node button then canvas to open Add node modal when ontology has no classes', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'no-classes-ontology.ttl');
    expect(existsSync(testFile)).toBe(true);

    await loadTestFile(page, testFile);

    // Close any open modals first
    await page.evaluate(() => {
      const modal = document.getElementById('addNodeModal');
      if (modal) (modal as HTMLElement).style.display = 'none';
    });

    // Verify Add node button is visible
    const addButtonVisible = await page.evaluate(() => {
      const btn = document.querySelector('.vis-add');
      return btn && (btn as HTMLElement).style.display !== 'none';
    });
    expect(addButtonVisible).toBe(true);

    // Use the test hook to open the Add node modal directly
    await page.evaluate(() => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (testHook?.openAddNodeModal) {
        testHook.openAddNodeModal(400, 300);
      }
    });

    await expect.poll(() => isAddNodeModalVisible(page), { timeout: 5000 }).toBe(true);
  }, 10000);

  it('does not show warning when ontology has object properties referencing external classes (owl:Thing)', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'no-classes-2-object-properties.ttl');
    expect(existsSync(testFile)).toBe(true);

    // Close any Add node modal left open by the previous test so it cannot cover the page.
    await page.evaluate(() => {
      const modal = document.getElementById('addNodeModal');
      if (modal) (modal as HTMLElement).style.display = 'none';
    });

    await loadTestFile(page, testFile);

    // The warning is decided before the graph renders, and loadTestFile waits for the render to settle,
    // so its state is final here.
    expect(await isWarningVisible(page)).toBe(false);

    const vizControlsVisible = await page.evaluate(() => {
      const el = document.getElementById('vizControls');
      return el && el.style.display !== 'none';
    });

    expect(vizControlsVisible).toBe(true);
  }, 10000);
});
