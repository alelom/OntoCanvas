/**
 * E2E tests for verifying that imported annotation properties have their range correctly detected.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
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
  browser = await chromium.launch();
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

describe('Annotation Property Range E2E', () => {
  it('should detect imported annotation property range as boolean', async () => {
    const childFile = join(TEST_FIXTURES_DIR, 'labellableRoot-child.ttl');
    expect(existsSync(childFile)).toBe(true);
    
    await loadTestFile(page, childFile);
    
    // Get annotation properties from the editor state
    const annotationProps = await page.evaluate(() => {
      const editorTest = (window as any).__EDITOR_TEST__;
      if (!editorTest || !editorTest.getAnnotationProperties) {
        return { found: false, items: [] };
      }
      const props = editorTest.getAnnotationProperties();
      return {
        found: true,
        items: props || [],
      };
    });
    
    
    // Find labellableRoot annotation property
    const labellableRootProp = annotationProps.items.find((ap: any) => ap.name === 'labellableRoot');
    
    if (labellableRootProp) {
      // Verify it's detected as a boolean property
      expect(labellableRootProp.isBoolean).toBe(true);
      // Verify the range is set to xsd:boolean
      expect(labellableRootProp.range).toBe('http://www.w3.org/2001/XMLSchema#boolean');
    } else {
      console.warn('[TEST] labellableRoot property not found in annotation properties');
      console.warn('[TEST] Available properties:', annotationProps.items.map((ap: any) => ({ name: ap.name, isBoolean: ap.isBoolean, range: ap.range })));
      throw new Error('labellableRoot annotation property not found');
    }
  });
});
