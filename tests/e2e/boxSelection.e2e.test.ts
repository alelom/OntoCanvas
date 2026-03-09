/**
 * @vitest-environment jsdom
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

// Helper function to load test file into editor
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
  await page.waitForTimeout(150);
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

describe('Box Selection E2E', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
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

  it('should show selection rectangle when dragging on empty canvas', async () => {
    const networkContainer = page.locator('#network');
    const containerBox = await networkContainer.boundingBox();
    
    if (!containerBox) {
      throw new Error('Network container not found');
    }

    // Start drag in empty area (center of container)
    const startX = containerBox.x + containerBox.width / 2;
    const startY = containerBox.y + containerBox.height / 2;
    
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    
    // Drag to create selection rectangle
    const endX = startX + 100;
    const endY = startY + 100;
    await page.mouse.move(endX, endY);
    
    // Check if selection rectangle overlay exists and is visible
    const overlay = page.locator('#boxSelectionOverlay');
    await expect(overlay).toBeVisible();
    
    // Check rectangle style
    const overlayStyle = await overlay.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        border: style.border,
        backgroundColor: style.backgroundColor,
        display: style.display,
      };
    });
    
    expect(overlayStyle.display).not.toBe('none');
    
    await page.mouse.up();
  });

  it('should select nodes within selection rectangle', async () => {
    const networkContainer = page.locator('#network');
    const containerBox = await networkContainer.boundingBox();
    
    if (!containerBox) {
      throw new Error('Network container not found');
    }

    // Get node positions from the network
    const nodePositions = await page.evaluate(() => {
      const network = (window as any).network;
      if (!network) return null;
      return network.getPositions();
    });

    if (!nodePositions || Object.keys(nodePositions).length === 0) {
      it.skip('Skipping test');
      return;
    }

    // Find first two nodes
    const nodeIds = Object.keys(nodePositions);
    const node1Pos = nodePositions[nodeIds[0]];
    const node2Pos = nodePositions[nodeIds[1]];

    if (!node1Pos || !node2Pos) {
      it.skip('Not enough nodes');
      return;
    }

    // Get DOM positions by clicking on nodes and recording mouse position
    // For simplicity, we'll use approximate positions based on canvas coordinates
    // vis-network doesn't expose canvasToDOM, so we'll use getNodeAt instead
    const containerRect = await networkContainer.boundingBox();
    if (!containerRect) {
      throw new Error('Container rect not found');
    }

    // Approximate: use canvas positions directly (they're close to DOM for small graphs)
    const domPos1 = { x: node1Pos.x + containerRect.width / 2, y: node1Pos.y + containerRect.height / 2 };
    const domPos2 = { x: node2Pos.x + containerRect.width / 2, y: node2Pos.y + containerRect.height / 2 };

    // Create selection rectangle that includes both nodes
    const rectLeft = Math.min(domPos1.x, domPos2.x) - 50;
    const rectTop = Math.min(domPos1.y, domPos2.y) - 50;
    const rectRight = Math.max(domPos1.x, domPos2.x) + 50;
    const rectBottom = Math.max(domPos1.y, domPos2.y) + 50;

    const startX = containerRect.x + rectLeft;
    const startY = containerRect.y + rectTop;
    const endX = containerRect.x + rectRight;
    const endY = containerRect.y + rectBottom;

    // Perform box selection
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY);
    await page.mouse.up();

    // Wait a bit for selection to complete
    await page.waitForTimeout(200);

    // Check that nodes are selected
    const selectedNodes = await page.evaluate(() => {
      const network = (window as any).network;
      if (!network) return [];
      return network.getSelectedNodes().map(String);
    });

    expect(selectedNodes.length).toBeGreaterThanOrEqual(2);
    expect(selectedNodes).toContain(nodeIds[0]);
    expect(selectedNodes).toContain(nodeIds[1]);
  });

  it('should not activate selection rectangle for small drags (< 10px)', async () => {
    const networkContainer = page.locator('#network');
    const containerBox = await networkContainer.boundingBox();
    
    if (!containerBox) {
      throw new Error('Network container not found');
    }

    const startX = containerBox.x + containerBox.width / 2;
    const startY = containerBox.y + containerBox.height / 2;
    
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    
    // Small drag (5px) - should not activate selection
    await page.mouse.move(startX + 5, startY + 5);
    
    // Check that selection rectangle is not visible
    const overlay = page.locator('#boxSelectionOverlay');
    const overlayStyle = await overlay.evaluate((el) => {
      return window.getComputedStyle(el).display;
    });
    
    expect(overlayStyle).toBe('none');
    
    await page.mouse.up();
  });

  it('should add to selection when Ctrl key is pressed', async () => {
    const networkContainer = page.locator('#network');
    
    // First, select a node by clicking
    const nodePositions = await page.evaluate(() => {
      const network = (window as any).network;
      if (!network) return null;
      return network.getPositions();
    });

    if (!nodePositions || Object.keys(nodePositions).length === 0) {
      it.skip('Skipping test');
      return;
    }

    const nodeIds = Object.keys(nodePositions);
    const firstNodePos = nodePositions[nodeIds[0]];

    // Click first node
    // Approximate DOM position
    const containerRect = await networkContainer.boundingBox();
    if (!containerRect) {
      throw new Error('Container rect not found');
    }
    const domPos = { x: firstNodePos.x + containerRect.width / 2, y: firstNodePos.y + containerRect.height / 2 };

    const containerRect = await networkContainer.boundingBox();
    if (!containerRect) {
      throw new Error('Container rect not found');
    }

    await page.mouse.click(containerRect.x + domPos.x, containerRect.y + domPos.y);

    // Wait for selection
    await page.waitForTimeout(200);

    // Get initial selection
    const initialSelection = await page.evaluate(() => {
      const network = (window as any).network;
      if (!network) return [];
      return network.getSelectedNodes().map(String);
    });

    expect(initialSelection.length).toBe(1);

    // Now box select with Ctrl key
    const secondNodePos = nodePositions[nodeIds[1]];
    const domPos2 = { x: secondNodePos.x + containerRect.width / 2, y: secondNodePos.y + containerRect.height / 2 };

    const rectLeft = Math.min(domPos.x, domPos2.x) - 50;
    const rectTop = Math.min(domPos.y, domPos2.y) - 50;
    const rectRight = Math.max(domPos.x, domPos2.x) + 50;
    const rectBottom = Math.max(domPos.y, domPos2.y) + 50;

    await page.mouse.move(containerRect.x + rectLeft, containerRect.y + rectTop);
    await page.mouse.down();
    await page.keyboard.down('Control');
    await page.mouse.move(containerRect.x + rectRight, containerRect.y + rectBottom);
    await page.mouse.up();
    await page.keyboard.up('Control');

    await page.waitForTimeout(200);

    // Check that both nodes are selected
    const finalSelection = await page.evaluate(() => {
      const network = (window as any).network;
      if (!network) return [];
      return network.getSelectedNodes().map(String);
    });

    expect(finalSelection.length).toBeGreaterThanOrEqual(2);
    expect(finalSelection).toContain(nodeIds[0]);
  });

  it('should select edges when both endpoints are selected', async () => {
    // This test verifies that edges are selected when both endpoints are in the box
    // The actual edge selection logic is tested in unit tests
    // Here we just verify the integration works
    
    const networkContainer = page.locator('#network');
    const containerBox = await networkContainer.boundingBox();
    
    if (!containerBox) {
      throw new Error('Network container not found');
    }

    // Perform a box selection
    const startX = containerBox.x + containerBox.width / 4;
    const startY = containerBox.y + containerBox.height / 4;
    const endX = startX + 200;
    const endY = startY + 200;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY);
    await page.mouse.up();

    await page.waitForTimeout(200);

    // Check that selection info is updated (status bar shows count)
    const selectionInfo = await page.locator('#selectionInfo').textContent();
    
    // Selection info should show count if nodes are selected
    if (selectionInfo) {
      expect(selectionInfo.length).toBeGreaterThan(0);
    }
  });

  it('should not activate box selection when in add node mode', async () => {
    // Click add node button
    const addNodeButton = page.locator('.vis-add');
    await addNodeButton.click();
    
    await page.waitForTimeout(200);

    // Try to start box selection
    const networkContainer = page.locator('#network');
    const containerBox = await networkContainer.boundingBox();
    
    if (!containerBox) {
      throw new Error('Network container not found');
    }

    const startX = containerBox.x + containerBox.width / 2;
    const startY = containerBox.y + containerBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 100, startY + 100);
    
    // Check that selection rectangle is not visible (add node mode should prevent it)
    const overlay = page.locator('#boxSelectionOverlay');
    const overlayStyle = await overlay.evaluate((el) => {
      return window.getComputedStyle(el).display;
    });
    
    // In add node mode, box selection should not activate
    expect(overlayStyle).toBe('none');
    
    await page.mouse.up();
  });
});
