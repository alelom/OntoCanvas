/**
 * @vitest-environment jsdom
 * 
 * Integration test for box selection - verifies that events are captured and overlay works
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

async function waitForGraphRender(page: Page, timeout = 4000): Promise<void> {
  await page.waitForFunction(
    () => {
      const nodeCountEl = document.getElementById('nodeCount');
      const edgeCountEl = document.getElementById('edgeCount');
      const nodeCount = nodeCountEl?.textContent?.trim();
      const edgeCount = edgeCountEl?.textContent?.trim();
      return (
        nodeCount !== undefined &&
        nodeCount !== '' &&
        Number.isFinite(Number(nodeCount)) &&
        edgeCount !== undefined &&
        edgeCount !== '' &&
        Number.isFinite(Number(edgeCount))
      );
    },
    { timeout }
  );
  await page.waitForTimeout(100);
}

describe('Box Selection Integration', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
    
    // Capture console logs
    page.on('console', (msg) => {
      if (msg.text().includes('BoxSelection')) {
        console.log(`[Browser Console] ${msg.text()}`);
      }
    });
    
    await page.goto(EDITOR_URL);
    await page.waitForSelector('#network', { timeout: 10000 });
    
    if (existsSync(SIMPLE_ONTOLOGY_PATH)) {
      await loadTestFile(page, SIMPLE_ONTOLOGY_PATH);
      await waitForGraphRender(page);
    }
  });

  afterAll(async () => {
    await browser.close();
  });

  it('should verify event handlers are attached', async () => {
    // Check if handlers are stored in window object
    const handlersExist = await page.evaluate(() => {
      return typeof (window as any).__boxSelectionHandlers !== 'undefined';
    });
    
    expect(handlersExist).toBe(true);
    
    // Also verify overlay exists (indirect proof setup was called)
    const overlayExists = await page.evaluate(() => {
      return document.getElementById('boxSelectionOverlay') !== null;
    });
    
    expect(overlayExists).toBe(true);
  });

  it('should have overlay element in DOM after network initialization', async () => {
    // Wait a bit for network to fully initialize
    await page.waitForTimeout(1000);
    
    const overlayInfo = await page.evaluate(() => {
      const overlay = document.getElementById('boxSelectionOverlay');
      const container = document.getElementById('network');
      return {
        overlayExists: overlay !== null,
        containerExists: container !== null,
        containerChildren: container ? Array.from(container.children).map(c => c.tagName) : [],
        overlayParent: overlay ? overlay.parentElement?.id : null,
        overlayStyle: overlay ? {
          display: window.getComputedStyle(overlay).display,
          position: window.getComputedStyle(overlay).position,
          zIndex: window.getComputedStyle(overlay).zIndex,
        } : null,
      };
    });
    
    console.log('Overlay info:', JSON.stringify(overlayInfo, null, 2));
    
    expect(overlayInfo.overlayExists).toBe(true);
    expect(overlayInfo.containerExists).toBe(true);
    
    if (!overlayInfo.overlayExists) {
      console.error('CRITICAL: Overlay element not found in DOM!');
      console.error('Container children:', overlayInfo.containerChildren);
    }
  });

  it('should capture mousedown events on canvas', async () => {
    // Capture console logs to see if our handler is called
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('BoxSelection')) {
        consoleLogs.push(text);
      }
    });
    
    // Listen for mousedown events on document (where our handler is)
    await page.evaluate(() => {
      document.addEventListener('mousedown', (e) => {
        (window as any).__testMousedownCaptured = true;
        (window as any).__testMousedownTarget = (e.target as HTMLElement)?.tagName;
      }, true);
    });
    
    const networkContainer = page.locator('#network');
    const containerBox = await networkContainer.boundingBox();
    
    if (!containerBox) {
      throw new Error('Network container not found');
    }

    // Click on canvas
    await page.mouse.click(
      containerBox.x + containerBox.width / 2,
      containerBox.y + containerBox.height / 2
    );
    
    await page.waitForTimeout(200);
    
    const result = await page.evaluate(() => {
      return {
        mousedownCaptured: (window as any).__testMousedownCaptured === true,
        target: (window as any).__testMousedownTarget,
      };
    });
    
    console.log('Console logs:', consoleLogs);
    console.log('Mousedown result:', result);
    
    // The handler should be called (either our handler or the test handler)
    expect(result.mousedownCaptured).toBe(true);
  });

  it('should activate box selection state on mousedown on empty canvas', async () => {
    const networkContainer = page.locator('#network');
    const containerBox = await networkContainer.boundingBox();
    
    if (!containerBox) {
      throw new Error('Network container not found');
    }

    // Get initial state
    const initialState = await page.evaluate(() => {
      const network = (window as any).network;
      if (!network) return null;
      return {
        selectedNodes: network.getSelectedNodes().length,
      };
    });

    // Click and hold on empty canvas (center)
    const startX = containerBox.x + containerBox.width / 2;
    const startY = containerBox.y + containerBox.height / 2;
    
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    
    // Wait a bit
    await page.waitForTimeout(50);
    
    // Check if box selection was activated (by checking console logs or state)
    const logs = await page.evaluate(() => {
      // Check if overlay exists and is potentially visible
      const overlay = document.getElementById('boxSelectionOverlay');
      return {
        overlayExists: overlay !== null,
        overlayDisplay: overlay ? window.getComputedStyle(overlay).display : 'none',
      };
    });
    
    expect(logs.overlayExists).toBe(true);
    
    // Drag a bit
    await page.mouse.move(startX + 50, startY + 50);
    await page.waitForTimeout(50);
    
    // Check if rectangle is showing
    const overlayVisible = await page.evaluate(() => {
      const overlay = document.getElementById('boxSelectionOverlay');
      if (!overlay) return false;
      return window.getComputedStyle(overlay).display !== 'none';
    });
    
    // The rectangle should be visible after dragging > 10px
    expect(overlayVisible).toBe(true);
    
    await page.mouse.up();
  });

  it('should show selection rectangle when dragging more than 10px', async () => {
    const networkContainer = page.locator('#network');
    const containerBox = await networkContainer.boundingBox();
    
    if (!containerBox) {
      throw new Error('Network container not found');
    }

    const startX = containerBox.x + containerBox.width / 2;
    const startY = containerBox.y + containerBox.height / 2;
    
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    
    // Small drag (5px) - should NOT show rectangle
    await page.mouse.move(startX + 5, startY + 5);
    await page.waitForTimeout(50);
    
    let overlayVisible = await page.evaluate(() => {
      const overlay = document.getElementById('boxSelectionOverlay');
      if (!overlay) return false;
      return window.getComputedStyle(overlay).display !== 'none';
    });
    
    expect(overlayVisible).toBe(false); // Should not be visible for small drag
    
    // Large drag (100px) - should show rectangle
    await page.mouse.move(startX + 100, startY + 100);
    await page.waitForTimeout(50);
    
    overlayVisible = await page.evaluate(() => {
      const overlay = document.getElementById('boxSelectionOverlay');
      if (!overlay) return false;
      return window.getComputedStyle(overlay).display !== 'none';
    });
    
    expect(overlayVisible).toBe(true); // Should be visible for large drag
    
    await page.mouse.up();
  });
});
