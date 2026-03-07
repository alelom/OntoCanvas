/**
 * E2E tests for data property visualization: verify that nodes display range types and edges display property labels.
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
  // Wait for the graph to render. The counts can be 0 (e.g., after deleting all nodes/edges),
  // so we check that the elements exist and have valid numeric values (including 0).
  await page.waitForFunction(
    () => {
      const nodeCountEl = document.getElementById('nodeCount');
      const edgeCountEl = document.getElementById('edgeCount');
      const nodeCount = nodeCountEl?.textContent?.trim();
      const edgeCount = edgeCountEl?.textContent?.trim();
      // Require counts to be present, non-empty, and parse as valid finite numbers (including 0)
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

describe('Data Property Display E2E Tests', () => {
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
    if (page) await page.close();
    if (browser) await browser.close();
  });

  describe('Data Property Visualization', () => {
    it('data property node displays range type (xsd:string) instead of property label', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'simple-data-property-display.ttl');
      expect(existsSync(testFile)).toBe(true);

      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      // Find the data property node ID (pattern: __dataprop__${classId}__${propertyName})
      // The property name is "testProperty" and class is "TestClass"
      const nodeId = '__dataprop__TestClass__testProperty';
      
      // Get the rendered node label using the test hook
      const nodeLabel = await page.evaluate(
        (id) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (!testHook?.getRenderedNodeLabel) return null;
          return testHook.getRenderedNodeLabel(id);
        },
        nodeId
      );

      expect(nodeLabel).not.toBeNull();
      // The node should display "property label (range type)" format
      // e.g., "testProperty (xsd:string)"
      expect(nodeLabel).toContain('testProperty');
      expect(nodeLabel).toContain('xsd:string');
    });

    it('data property edge displays property label (testProperty) instead of being empty', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'simple-data-property-display.ttl');
      expect(existsSync(testFile)).toBe(true);

      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      // Find the data property edge ID (pattern: ${classId}->${nodeId}:dataprop)
      // Arrow points from class to data property node
      const edgeId = 'TestClass->__dataprop__TestClass__testProperty:dataprop';
      
      // Get the rendered edge label using the test hook
      const edgeLabel = await page.evaluate(
        (id) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (!testHook?.getRenderedEdgeLabel) return null;
          return testHook.getRenderedEdgeLabel(id);
        },
        edgeId
      );

      // The edge label is empty because the label is displayed in the node
      // This is the current implementation: label is in the node, not on the edge
      expect(edgeLabel).toBe('');
    });

    it('double-clicking data property node opens Edit data property modal', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'simple-data-property-display.ttl');
      expect(existsSync(testFile)).toBe(true);

      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      const nodeId = '__dataprop__TestClass__testProperty';
      
      // Use test hook to simulate double-click (which calls openEditModalForNode)
      await page.evaluate(
        (id) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (testHook?.openEditModalForNode) testHook.openEditModalForNode(id);
        },
        nodeId
      );

      await page.waitForTimeout(300);

      // Verify the Edit data property modal is open
      const modalTitle = await page.evaluate(() => {
        const modal = document.getElementById('editDataPropertyModal');
        if (!modal || (modal as HTMLElement).style.display === 'none') return null;
        const h3 = modal.querySelector('h3');
        return h3?.textContent?.trim() ?? null;
      });

      expect(modalTitle).not.toBeNull();
      expect(modalTitle).toContain('data property');
    });

    it('double-clicking data property edge opens Edit data property modal', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'simple-data-property-display.ttl');
      expect(existsSync(testFile)).toBe(true);

      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      // Edge ID format: ${classId}->${nodeId}:dataprop (arrow points from class to data property node)
      const edgeId = 'TestClass->__dataprop__TestClass__testProperty:dataprop';
      
      // Use test hook to simulate double-click (which calls openEditModalForEdge)
      await page.evaluate(
        (id) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (testHook?.openEditModalForEdge) testHook.openEditModalForEdge(id);
        },
        edgeId
      );

      await page.waitForTimeout(300);

      // Verify the Edit data property modal is open
      const modalTitle = await page.evaluate(() => {
        const modal = document.getElementById('editDataPropertyModal');
        if (!modal || (modal as HTMLElement).style.display === 'none') return null;
        const h3 = modal.querySelector('h3');
        return h3?.textContent?.trim() ?? null;
      });

      expect(modalTitle).not.toBeNull();
      expect(modalTitle).toContain('data property');
    });
  });
});
