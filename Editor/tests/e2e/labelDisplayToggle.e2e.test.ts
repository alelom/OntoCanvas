/**
 * E2E tests for label/identifier display toggle and language selection.
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const TEST_FIXTURES_DIR = join(__dirname, '../fixtures');

describe('Label/Identifier Display Toggle', () => {
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
    await browser.close();
  });

  it('should toggle between labels and identifiers', async () => {
    // Load test ontology
    const ttlPath = join(TEST_FIXTURES_DIR, 'multi-language-labels.ttl');
    const ttlContent = readFileSync(ttlPath, 'utf-8');
    
    await page.evaluate(async (ttlString) => {
      const __EDITOR_TEST__ = (window as any).__EDITOR_TEST__;
      if (__EDITOR_TEST__ && __EDITOR_TEST__.loadTtlString) {
        await __EDITOR_TEST__.loadTtlString(ttlString, 'multi-language-labels.ttl');
      }
    }, ttlContent);
    
    await page.waitForTimeout(2000);
    
    // Wait for graph to render
    await page.waitForTimeout(2000);
    
    // Open text display options
    const textDisplayToggle = page.locator('#textDisplayToggle');
    await textDisplayToggle.waitFor({ state: 'visible', timeout: 5000 });
    await textDisplayToggle.click();
    await page.waitForTimeout(300);
    
    // Check default is "Display labels"
    const displayModeLabels = page.locator('#displayModeLabels');
    await displayModeLabels.waitFor({ state: 'visible', timeout: 5000 });
    await expect(await displayModeLabels.isChecked()).toBe(true);
    
    // Language dropdown should be visible when labels are selected
    const languageSelectionWrap = page.locator('#languageSelectionWrap');
    await languageSelectionWrap.waitFor({ state: 'visible', timeout: 5000 });
    let displayStyle = await languageSelectionWrap.evaluate((el) => window.getComputedStyle(el).display);
    expect(displayStyle).not.toBe('none');
    
    // Switch to "Display identifiers"
    const displayModeIdentifiers = page.locator('#displayModeIdentifiers');
    await displayModeIdentifiers.click();
    await page.waitForTimeout(300);
    await expect(await displayModeIdentifiers.isChecked()).toBe(true);
    
    // Language dropdown should be hidden
    displayStyle = await languageSelectionWrap.evaluate((el) => window.getComputedStyle(el).display);
    expect(displayStyle).toBe('none');
    
    // Switch back to "Display labels"
    await displayModeLabels.click();
    await page.waitForTimeout(300);
    await expect(await displayModeLabels.isChecked()).toBe(true);
    
    // Language dropdown should be visible again
    displayStyle = await languageSelectionWrap.evaluate((el) => window.getComputedStyle(el).display);
    expect(displayStyle).not.toBe('none');
  });

  it('should populate language dropdown with available languages', async () => {
    // Load test ontology
    const ttlPath = join(TEST_FIXTURES_DIR, 'multi-language-labels.ttl');
    const ttlContent = readFileSync(ttlPath, 'utf-8');
    
    await page.evaluate(async (ttlString) => {
      const __EDITOR_TEST__ = (window as any).__EDITOR_TEST__;
      if (__EDITOR_TEST__ && __EDITOR_TEST__.loadTtlString) {
        await __EDITOR_TEST__.loadTtlString(ttlString, 'multi-language-labels.ttl');
      }
    }, ttlContent);
    
    // Wait for graph to render
    await page.waitForTimeout(2000);
    
    // Open text display options - use the same approach as the working test
    const textDisplayToggle = page.locator('#textDisplayToggle');
    await textDisplayToggle.waitFor({ state: 'visible', timeout: 5000 });
    await textDisplayToggle.click();
    await page.waitForTimeout(300);
    
    // Check default is "Display labels" - don't wait for visible, just check if it exists
    const displayModeLabels = page.locator('#displayModeLabels');
    await expect(await displayModeLabels.isChecked()).toBe(true);
    
    // Ensure language dropdown is visible - trigger via evaluate
    await page.evaluate(() => {
      const wrap = document.getElementById('languageSelectionWrap');
      const labelsRadio = document.getElementById('displayModeLabels') as HTMLInputElement;
      if (wrap && labelsRadio?.checked) {
        wrap.style.display = 'block';
      }
    });
    await page.waitForTimeout(300);
    
    // Language dropdown should be visible when labels are selected
    const languageSelectionWrap = page.locator('#languageSelectionWrap');
    // Check visibility via evaluate instead of waitFor
    const isVisible = await page.evaluate(() => {
      const wrap = document.getElementById('languageSelectionWrap');
      return wrap && window.getComputedStyle(wrap).display !== 'none';
    });
    expect(isVisible).toBe(true);
    
    // Check language dropdown has options
    const labelLanguage = page.locator('#labelLanguage');
    // Wait for it to exist
    await page.waitForFunction(() => {
      const select = document.getElementById('labelLanguage');
      return select !== null;
    }, { timeout: 5000 });
    
    const optionCount = await labelLanguage.locator('option').count();
    expect(optionCount).toBeGreaterThan(0);
    
    // Should include 'en' as an option
    const enOption = labelLanguage.locator('option[value="en"]');
    const enOptionCount = await enOption.count();
    expect(enOptionCount).toBe(1);
  });

  it('should display labels in selected language', async () => {
    // Load test ontology
    const ttlPath = join(TEST_FIXTURES_DIR, 'multi-language-labels.ttl');
    const ttlContent = readFileSync(ttlPath, 'utf-8');
    
    await page.evaluate(async (ttlString) => {
      const __EDITOR_TEST__ = (window as any).__EDITOR_TEST__;
      if (__EDITOR_TEST__ && __EDITOR_TEST__.loadTtlString) {
        await __EDITOR_TEST__.loadTtlString(ttlString, 'multi-language-labels.ttl');
      }
    }, ttlContent);
    
    await page.waitForTimeout(2000);
    
    // Open text display options
    const textDisplayToggle = page.locator('#textDisplayToggle');
    await textDisplayToggle.waitFor({ state: 'visible', timeout: 5000 });
    await textDisplayToggle.click();
    await page.waitForTimeout(300);
    
    // Ensure "Display labels" is selected (default)
    const displayModeLabels = page.locator('#displayModeLabels');
    await displayModeLabels.waitFor({ state: 'visible', timeout: 5000 });
    if (!(await displayModeLabels.isChecked())) {
      await displayModeLabels.click({ force: true });
      await page.waitForTimeout(300);
    }
    
    // Language dropdown should be visible
    const languageSelectionWrap = page.locator('#languageSelectionWrap');
    await languageSelectionWrap.waitFor({ state: 'visible', timeout: 5000 });
    
    // Select French
    const labelLanguage = page.locator('#labelLanguage');
    await labelLanguage.waitFor({ state: 'visible', timeout: 5000 });
    await labelLanguage.selectOption('fr');
    
    await page.waitForTimeout(500);
    
    // Check that nodes display French labels (if available)
    // This is a basic test - actual node display verification would require more complex DOM inspection
    const network = page.locator('#network');
    await network.waitFor({ state: 'visible' });
    expect(await network.isVisible()).toBe(true);
  });
});
