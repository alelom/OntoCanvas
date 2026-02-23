/**
 * E2E tests for label/identifier display functionality in the graph.
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

describe('Label/Identifier Display Functionality', () => {
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

  async function loadTestOntology(): Promise<void> {
    const ttlPath = join(TEST_FIXTURES_DIR, 'multi-language-node.ttl');
    const ttlContent = readFileSync(ttlPath, 'utf-8');
    
    await page.evaluate(async (ttlString) => {
      const __EDITOR_TEST__ = (window as any).__EDITOR_TEST__;
      if (__EDITOR_TEST__ && __EDITOR_TEST__.loadTtlString) {
        await __EDITOR_TEST__.loadTtlString(ttlString, 'multi-language-node.ttl');
      }
    }, ttlContent);
    
    // Wait for network to be ready and nodes to be rendered
    // First wait for rawData to have nodes (this happens immediately after parsing)
    await page.waitForFunction(() => {
      const __EDITOR_TEST__ = (window as any).__EDITOR_TEST__;
      return __EDITOR_TEST__?.rawData?.nodes?.length > 0;
    }, { timeout: 10000 });
    
    // Then wait for network to be initialized with nodes
    await page.waitForFunction(() => {
      const network = (window as any).network;
      if (!network || !network.body || !network.body.data || !network.body.data.nodes) {
        return false;
      }
      const nodes = network.body.data.nodes;
      // DataSet - check by iterating
      let count = 0;
      nodes.forEach(() => count++);
      return count > 0;
    }, { timeout: 15000 });
    
    // Wait for applyFilter to complete and network to update
    await page.waitForTimeout(2000);
    
    // Verify node exists in rawData
    const nodeExists = await page.evaluate(() => {
      const __EDITOR_TEST__ = (window as any).__EDITOR_TEST__;
      if (__EDITOR_TEST__ && __EDITOR_TEST__.rawData) {
        const found = __EDITOR_TEST__.rawData.nodes.some((n: any) => n.id === 'testNode');
        console.log('Node exists in rawData:', found);
        console.log('Available node IDs:', __EDITOR_TEST__.rawData.nodes.map((n: any) => n.id));
        return found;
      }
      return false;
    });
    expect(nodeExists).toBe(true);
  }

  async function getNodeDisplayText(): Promise<string | null> {
    // Wait a bit for the network to update after applyFilter
    await page.waitForTimeout(1500);
    return await page.evaluate(() => {
      const __EDITOR_TEST__ = (window as any).__EDITOR_TEST__;
      if (__EDITOR_TEST__ && __EDITOR_TEST__.getNodeDisplayText) {
        const result = __EDITOR_TEST__.getNodeDisplayText('testNode');
        if (result) return result;
      }
      // Fallback: try to get from network data directly
      const network = (window as any).network;
      if (network && network.body && network.body.data && network.body.data.nodes) {
        const nodes = network.body.data.nodes;
        // Try direct get
        let node = nodes.get('testNode');
        if (!node) {
          // Try iterating to find it
          nodes.forEach((n: any, id: string) => {
            if (id === 'testNode' && !node) node = n;
          });
        }
        if (node && node.options) {
          const label = node.options.label;
          if (label) {
            return label.replace(/\n/g, ' ').trim();
          }
        }
      }
      return null;
    });
  }

  async function setDisplayMode(mode: 'labels' | 'identifiers'): Promise<void> {
    await page.evaluate((m) => {
      const labelsRadio = document.getElementById('displayModeLabels') as HTMLInputElement;
      const identifiersRadio = document.getElementById('displayModeIdentifiers') as HTMLInputElement;
      if (m === 'labels' && labelsRadio) {
        labelsRadio.checked = true;
        identifiersRadio.checked = false;
        labelsRadio.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (m === 'identifiers' && identifiersRadio) {
        identifiersRadio.checked = true;
        labelsRadio.checked = false;
        identifiersRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, mode);
    // Wait for applyFilter to complete
    await page.waitForTimeout(1000);
  }

  async function setLanguage(language: string): Promise<void> {
    await page.evaluate((lang) => {
      const select = document.getElementById('labelLanguage') as HTMLSelectElement;
      if (select) {
        select.value = lang;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, language);
    // Wait for applyFilter to complete
    await page.waitForTimeout(1000);
  }

  async function openTextDisplayOptions(): Promise<void> {
    const textDisplayToggle = page.locator('#textDisplayToggle');
    await textDisplayToggle.waitFor({ state: 'visible', timeout: 5000 });
    await textDisplayToggle.click();
    await page.waitForTimeout(300);
    
    // Ensure language dropdown is visible if labels mode is selected
    await page.evaluate(() => {
      const wrap = document.getElementById('languageSelectionWrap');
      const labelsRadio = document.getElementById('displayModeLabels') as HTMLInputElement;
      if (wrap && labelsRadio?.checked) {
        wrap.style.display = 'block';
      }
    });
    await page.waitForTimeout(300);
  }

  it('should display identifier when "Display identifiers" is selected', async () => {
    await loadTestOntology();
    await openTextDisplayOptions();
    
    // Switch to "Display identifiers"
    await setDisplayMode('identifiers');
    
    // Verify node displays identifier
    const displayText = await getNodeDisplayText();
    expect(displayText).toBe('testNode');
  });
  
  it('should display identifier when default language has no label', async () => {
    await loadTestOntology();
    await openTextDisplayOptions();
    
    // Ensure "Display labels" is selected
    await setDisplayMode('labels');
    
    // Set language to French (no label exists)
    await setLanguage('fr');
    
    // Verify node displays identifier as fallback
    const displayText = await getNodeDisplayText();
    expect(displayText).toBe('testNode');
  });

  it('should display label in default language (en) when "Display labels" is selected by default', async () => {
    await loadTestOntology();
    await openTextDisplayOptions();
    
    // Ensure "Display labels" is selected (default)
    const displayModeLabels = page.locator('#displayModeLabels');
    const isChecked = await displayModeLabels.isChecked();
    if (!isChecked) {
      await setDisplayMode('labels');
    }
    
    // Default language should be 'en'
    const labelLanguage = page.locator('#labelLanguage');
    const defaultLang = await labelLanguage.evaluate((el: HTMLSelectElement) => el.value);
    expect(defaultLang).toBe('en');
    
    // Verify node displays English label
    const displayText = await getNodeDisplayText();
    expect(displayText).toBe('Test Node');
  });

  it('should display label in Italian when Italian is selected', async () => {
    await loadTestOntology();
    await openTextDisplayOptions();
    
    // Ensure "Display labels" is selected
    await setDisplayMode('labels');
    
    // Select Italian
    await setLanguage('it');
    
    // Verify node displays Italian label
    const displayText = await getNodeDisplayText();
    expect(displayText).toBe('Nodo di prova');
  });

  it('should display label in German when German is selected', async () => {
    await loadTestOntology();
    await openTextDisplayOptions();
    
    // Ensure "Display labels" is selected
    await setDisplayMode('labels');
    
    // Select German
    await setLanguage('de');
    
    // Verify node displays German label
    const displayText = await getNodeDisplayText();
    expect(displayText).toBe('Testknoten');
  });

  it('should display identifier when language is selected but no label exists for that language', async () => {
    await loadTestOntology();
    await openTextDisplayOptions();
    
    // Ensure "Display labels" is selected
    await setDisplayMode('labels');
    
    // Select French (no label exists)
    await setLanguage('fr');
    
    // Verify node displays identifier as fallback
    const displayText = await getNodeDisplayText();
    expect(displayText).toBe('testNode');
  });

  it('should display identifier when switching from labels to identifiers', async () => {
    await loadTestOntology();
    await openTextDisplayOptions();
    
    // Start with "Display labels"
    await setDisplayMode('labels');
    await setLanguage('en');
    
    // Verify shows label first
    let displayText = await getNodeDisplayText();
    expect(displayText).toBe('Test Node');
    
    // Switch to "Display identifiers"
    await setDisplayMode('identifiers');
    
    // Verify now shows identifier
    displayText = await getNodeDisplayText();
    expect(displayText).toBe('testNode');
  });

  it('should display label when switching from identifiers to labels', async () => {
    await loadTestOntology();
    await openTextDisplayOptions();
    
    // Start with "Display identifiers"
    await setDisplayMode('identifiers');
    
    // Verify shows identifier first
    let displayText = await getNodeDisplayText();
    expect(displayText).toBe('testNode');
    
    // Switch to "Display labels"
    await setDisplayMode('labels');
    await setLanguage('en');
    
    // Verify now shows label
    displayText = await getNodeDisplayText();
    expect(displayText).toBe('Test Node');
  });

  it('should update display when language changes while in labels mode', async () => {
    await loadTestOntology();
    await openTextDisplayOptions();
    
    // Ensure "Display labels" is selected
    await setDisplayMode('labels');
    
    // Start with English
    await setLanguage('en');
    let displayText = await getNodeDisplayText();
    expect(displayText).toBe('Test Node');
    
    // Switch to Italian
    await setLanguage('it');
    displayText = await getNodeDisplayText();
    expect(displayText).toBe('Nodo di prova');
    
    // Switch to German
    await setLanguage('de');
    displayText = await getNodeDisplayText();
    expect(displayText).toBe('Testknoten');
    
    // Switch to French (no label) - should show identifier
    await setLanguage('fr');
    displayText = await getNodeDisplayText();
    expect(displayText).toBe('testNode');
  });
});
