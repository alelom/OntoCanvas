/**
 * E2E tests for verifying that imported annotation properties appear in the top menu dropdown with their prefix.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { loadTestFile } from './testHelpers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const TEST_FIXTURES_DIR = join(__dirname, '../fixtures/imported-ontology');

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage();
  await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });
});

afterEach(async () => {
  if (page && !page.isClosed()) {
    await page.close();
  }
});

describe('Annotation Property Prefix E2E', () => {
  it('should display imported annotation properties with prefix in top menu dropdown', async () => {
    const childFile = join(TEST_FIXTURES_DIR, 'labellableRoot-child.ttl');
    expect(existsSync(childFile)).toBe(true);
    
    await loadTestFile(page, childFile);
    
    // Get annotation properties from the dropdown
    const annotationProps = await page.evaluate(() => {
      const annotationPropsContent = document.getElementById('annotationPropsContent');
      if (!annotationPropsContent) return { found: false, items: [] };
      
      const items = Array.from(annotationPropsContent.querySelectorAll('div[style*="margin: 8px 0"]'));
      return {
        found: true,
        items: items.map((item) => ({
          text: item.textContent?.trim() || '',
          html: item.innerHTML,
        })),
      };
    });
    
    
    // Verify that labellableRoot appears with prefix "core:"
    const labellableRootItem = annotationProps.items.find((item: any) => 
      item.text?.includes('labellableRoot') || item.html?.includes('labellableRoot')
    );
    
    if (labellableRootItem) {
      const itemText = labellableRootItem.text || labellableRootItem.html;
      // Should contain the prefix
      expect(itemText).toContain('core:labellableRoot');
      // Should not start with just "labellableRoot" (without prefix)
      // But it will contain "labellableRoot" as part of "core:labellableRoot", so we check the display name specifically
      const displayNameMatch = itemText.match(/core:\s*labellableRoot/i);
      expect(displayNameMatch).toBeTruthy();
      // Verify it's displayed with the prefix in the bold text
      expect(labellableRootItem.html).toContain('>core:labellableRoot<');
    } else {
      console.warn('[TEST] labellableRoot item not found in annotation properties');
      console.warn('[TEST] Available items:', annotationProps.items.map((item: any) => ({ text: item.text?.substring(0, 100) })));
      throw new Error('labellableRoot annotation property not found');
    }
  });
});
