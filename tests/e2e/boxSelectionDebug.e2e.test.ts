/**
 * @vitest-environment jsdom
 * 
 * Debug test for box selection - this test helps identify why box selection isn't working
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = process.env.EDITOR_E2E_URL || 'http://localhost:5173/';
const TEST_FIXTURES_DIR = join(__dirname, '../fixtures');
const SIMPLE_ONTOLOGY_PATH = join(TEST_FIXTURES_DIR, 'simple-object-property.ttl');

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

describe('Box Selection Debug', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: false }); // Run visible for debugging
    page = await browser.newPage();
    await page.goto(EDITOR_URL);
    await page.waitForSelector('#network', { timeout: 10000 });
    
    if (existsSync(SIMPLE_ONTOLOGY_PATH)) {
      await loadTestFile(page, SIMPLE_ONTOLOGY_PATH);
      await page.waitForTimeout(1000); // Wait for graph to render
    }
  });

  afterAll(async () => {
    await browser.close();
  });

  it('should verify overlay element exists', async () => {
    const overlay = await page.locator('#boxSelectionOverlay');
    const exists = await overlay.count() > 0;
    expect(exists).toBe(true);
    
    if (exists) {
      const style = await overlay.evaluate((el) => {
        return {
          position: window.getComputedStyle(el).position,
          display: window.getComputedStyle(el).display,
          zIndex: window.getComputedStyle(el).zIndex,
        };
      });
      console.log('Overlay style:', style);
    }
  });

  it('should verify box selection state is initialized', async () => {
    // Check if the overlay is in the DOM
    const overlayExists = await page.evaluate(() => {
      return document.getElementById('boxSelectionOverlay') !== null;
    });
    expect(overlayExists).toBe(true);
  });

  it('should show rectangle when dragging (manual verification)', async () => {
    const networkContainer = page.locator('#network');
    const containerBox = await networkContainer.boundingBox();
    
    if (!containerBox) {
      throw new Error('Network container not found');
    }

    // Start drag
    const startX = containerBox.x + containerBox.width / 2;
    const startY = containerBox.y + containerBox.height / 2;
    
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    
    // Drag 100px
    await page.mouse.move(startX + 100, startY + 100);
    
    // Check if overlay is visible
    const overlay = page.locator('#boxSelectionOverlay');
    const isVisible = await overlay.evaluate((el) => {
      return window.getComputedStyle(el).display !== 'none';
    });
    
    console.log('Overlay visible during drag:', isVisible);
    
    // Take a screenshot for manual inspection
    await page.screenshot({ path: 'box-selection-debug.png' });
    
    await page.mouse.up();
    
    // This test is for debugging - we expect it might fail
    // The important thing is to see the console output and screenshot
  });
});
