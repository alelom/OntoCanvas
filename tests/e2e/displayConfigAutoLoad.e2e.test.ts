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

describe('Display config auto-load E2E', () => {
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
    
    // Should show warning for no classes, but no error. loadTestFile waited for this load to finish.
    
    const errorMsg = await page.evaluate(() => {
      const el = document.getElementById('errorMsg');
      return el && el.style.display !== 'none' && el.textContent?.trim() !== '';
    });
    // Should not have an error (only a warning for no classes)
    expect(errorMsg).toBe(false);
  });
});
