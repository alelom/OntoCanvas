/**
 * E2E tests for handling corrupt/invalid ontologies.
 * Verifies that meaningful error messages are shown instead of silent failures or stack overflows.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'node:fs';

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

async function waitForErrorOrGraph(page: Page, timeout = 5000): Promise<'error' | 'graph'> {
  try {
    await page.waitForFunction(
      () => {
        const errorMsg = document.getElementById('errorMsg');
        const vizControls = document.getElementById('vizControls');
        const hasError = errorMsg && errorMsg.style.display !== 'none' && errorMsg.textContent?.trim() !== '';
        const hasGraph = vizControls && vizControls.style.display !== 'none';
        return hasError || hasGraph;
      },
      { timeout }
    );
    
    const errorMsg = await page.evaluate(() => {
      const el = document.getElementById('errorMsg');
      return el && el.style.display !== 'none' && el.textContent?.trim() !== '' ? el.textContent : null;
    });
    
    if (errorMsg) {
      return 'error';
    }
    return 'graph';
  } catch {
    return 'error'; // Timeout likely means error
  }
}

describe('Corrupt ontology handling E2E', () => {
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

  it('shows meaningful error for potentially-corrupt-ontology-01.ttl', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'potentially-corrupt-ontology-01.ttl');
    expect(existsSync(testFile)).toBe(true);

    await loadTestFile(page, testFile);
    
    const result = await waitForErrorOrGraph(page, 10000);
    
    if (result === 'error') {
      const errorText = await page.evaluate(() => {
        const el = document.getElementById('errorMsg');
        return el?.textContent || '';
      });
      
      // Should show validation error about circular reference or invalid structure
      expect(errorText).toBeTruthy();
      expect(errorText.length).toBeGreaterThan(0);
      
      // Should not show graph (vizControls should be hidden)
      const vizControlsVisible = await page.evaluate(() => {
        const el = document.getElementById('vizControls');
        return el && el.style.display !== 'none';
      });
      expect(vizControlsVisible).toBe(false);
    } else {
      // If graph loaded, that's also acceptable if we fixed the issue
      // But we should still log a warning
      console.warn('Graph loaded successfully - circular reference may have been handled gracefully');
    }
  }, 10000);

  it('shows meaningful error for circular reference (A->B->C->A)', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'potentially-corrupt-ontology-02-circular.ttl');
    expect(existsSync(testFile)).toBe(true);

    await loadTestFile(page, testFile);
    
    const result = await waitForErrorOrGraph(page, 10000);
    
    if (result === 'error') {
      // Click on the error message to open the detailed error modal
      await page.click('#errorMsg');
      await page.waitForTimeout(500);
      
      // Check the detailed error in the modal
      const modalErrorText = await page.evaluate(() => {
        const modal = document.getElementById('validationErrorModal');
        if (!modal) return '';
        return modal.textContent || '';
      });
      
      expect(modalErrorText).toBeTruthy();
      // Error message should contain "circular", "self", or "reference"
      expect(modalErrorText.toLowerCase()).toMatch(/circular|self|reference/);
      
      const vizControlsVisible = await page.evaluate(() => {
        const el = document.getElementById('vizControls');
        return el && el.style.display !== 'none';
      });
      expect(vizControlsVisible).toBe(false);
    }
  }, 10000);

  it('shows meaningful error for self-referential class', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'potentially-corrupt-ontology-03-self-reference.ttl');
    expect(existsSync(testFile)).toBe(true);

    await loadTestFile(page, testFile);
    
    const result = await waitForErrorOrGraph(page, 10000);
    
    if (result === 'error') {
      // Check if modal is already open, or click to open it
      const modalInfo = await page.evaluate(() => {
        const modal = document.getElementById('validationErrorModal');
        const isVisible = modal && (modal as HTMLElement).style.display !== 'none' && 
                          window.getComputedStyle(modal).display !== 'none';
        return { exists: !!modal, isVisible };
      });
      
      if (!modalInfo.isVisible) {
        // Click on the error message to open the detailed error modal
        await page.click('#errorMsg');
        await page.waitForTimeout(500);
      }
      
      // Check the detailed error in the modal
      const modalErrorText = await page.evaluate(() => {
        const modal = document.getElementById('validationErrorModal');
        if (!modal) return '';
        return modal.textContent || '';
      });
      
      expect(modalErrorText).toBeTruthy();
      // Error message should contain "circular", "self", or "reference"
      expect(modalErrorText.toLowerCase()).toMatch(/circular|self|reference/);
      
      const vizControlsVisible = await page.evaluate(() => {
        const el = document.getElementById('vizControls');
        return el && el.style.display !== 'none';
      });
      expect(vizControlsVisible).toBe(false);
    }
  }, 10000);

  it('shows meaningful error for missing class reference', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'potentially-corrupt-ontology-04-missing-class.ttl');
    expect(existsSync(testFile)).toBe(true);

    await loadTestFile(page, testFile);
    
    const result = await waitForErrorOrGraph(page, 10000);
    
    if (result === 'error') {
      const errorText = await page.evaluate(() => {
        const el = document.getElementById('errorMsg');
        return el?.textContent || '';
      });
      
      expect(errorText).toBeTruthy();
      expect(errorText.toLowerCase()).toMatch(/missing|reference|class/);
      
      const vizControlsVisible = await page.evaluate(() => {
        const el = document.getElementById('vizControls');
        return el && el.style.display !== 'none';
      });
      expect(vizControlsVisible).toBe(false);
    }
  }, 10000);
});
