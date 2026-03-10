/**
 * E2E tests for automatic display config loading from sibling .display.json files.
 * 
 * Note: Full testing of the File System Access API path (showOpenFilePicker) is limited
 * in headless E2E tests. This test verifies that:
 * 1. The feature doesn't break when loading files via the fallback file input
 * 2. The code path exists and handles errors gracefully
 * 
 * Manual testing with showOpenFilePicker is recommended to fully verify the feature.
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
      const vizControls = document.getElementById('vizControls');
      return vizControls && vizControls.style.display !== 'none';
    },
    { timeout }
  );
  // Give a bit more time for the graph to fully render
  await page.waitForTimeout(300);
}

describe('Display config auto-load E2E', () => {
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
    await browser.close();
  });

  it('should load ontology without breaking when display config file exists (fallback file input)', async () => {
    const ontologyPath = join(TEST_FIXTURES_DIR, 'simple-object-property.ttl');
    const displayConfigPath = join(TEST_FIXTURES_DIR, 'simple-object-property.display.json');
    
    expect(existsSync(ontologyPath)).toBe(true);
    expect(existsSync(displayConfigPath)).toBe(true);
    
    await loadTestFile(page, ontologyPath);
    await waitForGraphRender(page);
    
    // Verify the graph loaded successfully
    const vizControls = await page.evaluate(() => {
      const el = document.getElementById('vizControls');
      return el && el.style.display !== 'none';
    });
    expect(vizControls).toBe(true);
    
    // Verify no error was shown
    const errorMsg = await page.evaluate(() => {
      const el = document.getElementById('errorMsg');
      return el && el.style.display !== 'none' && el.textContent?.trim() !== '';
    });
    expect(errorMsg).toBe(false);
  });

  it('should handle loading ontology when display config file does not exist', async () => {
    // Use a file that doesn't have a corresponding .display.json
    const ontologyPath = join(TEST_FIXTURES_DIR, 'no-classes-ontology.ttl');
    
    expect(existsSync(ontologyPath)).toBe(true);
    
    await loadTestFile(page, ontologyPath);
    
    // Should show warning for no classes, but no error
    await page.waitForTimeout(500);
    
    const errorMsg = await page.evaluate(() => {
      const el = document.getElementById('errorMsg');
      return el && el.style.display !== 'none' && el.textContent?.trim() !== '';
    });
    // Should not have an error (only a warning for no classes)
    expect(errorMsg).toBe(false);
  });
});
