/**
 * E2E tests for data property drag coupling: when a domain class is dragged,
 * its attached data property nodes move with it; data property nodes remain
 * independently draggable.
 * @vitest-environment jsdom
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
  await page.waitForTimeout(150);
}

describe('Data Property Drag Coupling E2E Tests', () => {
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
    if (page) await page.close();
    if (browser) await browser.close();
  });

  describe('Move with parent', () => {
    it('when class node is dragged, attached data property nodes move by same delta', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'simple-data-property-display.ttl');
      expect(existsSync(testFile)).toBe(true);

      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      const classId = 'TestClass';
      const dataPropId = '__dataprop__TestClass__testProperty';

      const initialPositions = await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        const net = testHook?.getNetwork?.();
        if (!net) return null;
        return net.getPositions();
      });
      expect(initialPositions).not.toBeNull();
      expect(initialPositions![classId]).toBeDefined();
      expect(initialPositions![dataPropId]).toBeDefined();

      const initialClass = initialPositions![classId];
      const initialDataProp = initialPositions![dataPropId];
      const newClassX = initialClass.x + 80;
      const newClassY = initialClass.y + 60;

      await page.evaluate(
        ({ classId, newClassX, newClassY }) => {
          const testHook = (window as any).__EDITOR_TEST__;
          const net = testHook?.getNetwork?.();
          if (!net) return;
          net.setSelection({ nodes: [classId] });
          net.emit('dragStart');
          net.moveNode(classId, newClassX, newClassY);
          net.emit('dragging');
          net.emit('dragEnd');
        },
        { classId, newClassX, newClassY }
      );
      await page.waitForTimeout(200);

      const positionsAfter = await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        const net = testHook?.getNetwork?.();
        if (!net) return null;
        return net.getPositions();
      });
      expect(positionsAfter).not.toBeNull();

      expect(positionsAfter![classId].x).toBeCloseTo(newClassX, 0);
      expect(positionsAfter![classId].y).toBeCloseTo(newClassY, 0);

      const expectedDataPropX = initialDataProp.x + 80;
      const expectedDataPropY = initialDataProp.y + 60;
      expect(positionsAfter![dataPropId].x).toBeCloseTo(expectedDataPropX, 0);
      expect(positionsAfter![dataPropId].y).toBeCloseTo(expectedDataPropY, 0);
    });
  });

  describe('Independent drag', () => {
    it('when only data property node is moved, class node position is unchanged', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'simple-data-property-display.ttl');
      expect(existsSync(testFile)).toBe(true);

      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      const classId = 'TestClass';
      const dataPropId = '__dataprop__TestClass__testProperty';

      const initialPositions = await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        const net = testHook?.getNetwork?.();
        if (!net) return null;
        return net.getPositions();
      });
      expect(initialPositions).not.toBeNull();
      const initialClassX = initialPositions![classId].x;
      const initialClassY = initialPositions![classId].y;

      await page.evaluate(
        ({ dataPropId }) => {
          const testHook = (window as any).__EDITOR_TEST__;
          const net = testHook?.getNetwork?.();
          if (!net) return;
          const pos = net.getPositions()[dataPropId];
          if (!pos) return;
          net.setSelection({ nodes: [dataPropId] });
          net.moveNode(dataPropId, pos.x + 50, pos.y + 40);
          net.emit('dragEnd');
        },
        { dataPropId }
      );
      await page.waitForTimeout(200);

      const positionsAfter = await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        const net = testHook?.getNetwork?.();
        if (!net) return null;
        return net.getPositions();
      });
      expect(positionsAfter).not.toBeNull();

      expect(positionsAfter![classId].x).toBeCloseTo(initialClassX, 0);
      expect(positionsAfter![classId].y).toBeCloseTo(initialClassY, 0);
      expect(positionsAfter![dataPropId].x).toBeCloseTo(initialPositions![dataPropId].x + 50, 0);
      expect(positionsAfter![dataPropId].y).toBeCloseTo(initialPositions![dataPropId].y + 40, 0);
    });
  });
});
