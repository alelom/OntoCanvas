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

const EDITOR_URL = 'http://localhost:5173/';
const TEST_FIXTURES_DIR = join(__dirname, '../fixtures');

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
      return nodeCount !== '0' && nodeCount !== undefined && edgeCount !== '0' && edgeCount !== undefined;
    },
    { timeout }
  );
  await page.waitForTimeout(100);
}

// Helper function to find edge in graph
async function findEdgeInGraph(
  page: Page,
  fromLabel: string,
  toLabel: string,
  typeLabel?: string
): Promise<string | null> {
  const edgeId = await page.evaluate(
    ({ fromLabel, toLabel, typeLabel }) => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (!testHook) return null;
      return testHook.findEdgeByLabels(fromLabel, toLabel, typeLabel);
    },
    { fromLabel, toLabel, typeLabel }
  );
  return edgeId;
}

// Helper function to open edit edge modal
async function openEditEdgeModal(page: Page, edgeId: string): Promise<boolean> {
  const result = await page.evaluate(
    (edgeId) => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (!testHook) return false;
      return testHook.editEdge(edgeId);
    },
    edgeId
  );
  
  await page.waitForTimeout(100);
  return result;
}

// Helper function to get edit edge modal values
async function getEditEdgeModalValues(page: Page): Promise<{
  minCardinality: string;
  maxCardinality: string;
  isRestrictionChecked: boolean;
} | null> {
  return await page.evaluate(() => {
    const testHook = (window as any).__EDITOR_TEST__;
    if (!testHook) return null;
    return testHook.getEditEdgeModalValues();
  });
}

// Helper function to close edit edge modal
async function closeEditEdgeModal(page: Page): Promise<void> {
  await page.evaluate(() => {
    const testHook = (window as any).__EDITOR_TEST__;
    if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
  });
  await page.waitForTimeout(50);
  const cancelBtn = page.locator('#editEdgeCancel');
  if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await cancelBtn.click({ timeout: 2000 });
    await page.waitForTimeout(80);
  }
}

describe('Edit Edge Modal E2E Tests', () => {
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
    try {
      await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (testHook?.clearDisplayConfig) testHook.clearDisplayConfig();
      });
      await page.waitForTimeout(50);
    } catch {
      // IndexedDB may not exist yet
    }
  });

  afterAll(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
  });

  describe('Simple Object Property (Non-Restriction)', () => {
    it('should display empty cardinality and unchecked checkbox for simple object property', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'simple-object-property.ttl');
      expect(existsSync(testFile)).toBe(true);

      // Load test file
      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      // Find the edge
      const edgeId = await findEdgeInGraph(page, 'Class A', 'Class B', 'has property');
      expect(edgeId).not.toBeNull();
      expect(edgeId).toBeTruthy();

      // Open edit edge modal
      const opened = await openEditEdgeModal(page, edgeId!);
      expect(opened).toBe(true);

      // Get modal values
      const modalValues = await getEditEdgeModalValues(page);
      expect(modalValues).not.toBeNull();

      // Verify values
      expect(modalValues?.minCardinality).toBe('');
      expect(modalValues?.maxCardinality).toBe('');
      expect(modalValues?.isRestrictionChecked).toBe(false);

      // Close modal
      await closeEditEdgeModal(page);
    });
  });

  describe('Object Property Restriction', () => {
    it('should display cardinality and checked checkbox for restriction', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'simple-restriction.ttl');
      expect(existsSync(testFile)).toBe(true);

      // Load test file
      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      // Find the edge
      const edgeId = await findEdgeInGraph(page, 'Class A', 'Class B', 'has property');
      expect(edgeId).not.toBeNull();
      expect(edgeId).toBeTruthy();

      // Verify edge data in rawData
      const edgeData = await page.evaluate(
        (edgeId) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (!testHook) return null;
          return testHook.getEdgeData(edgeId);
        },
        edgeId!
      );
      expect(edgeData).not.toBeNull();
      expect(edgeData?.isRestriction).toBe(true);
      expect(edgeData?.minCardinality).toBe(2);
      expect(edgeData?.maxCardinality).toBeNull();

      // Open edit edge modal
      const opened = await openEditEdgeModal(page, edgeId!);
      expect(opened).toBe(true);

      // Get modal values
      const modalValues = await getEditEdgeModalValues(page);
      expect(modalValues).not.toBeNull();

      // Verify values
      expect(modalValues?.minCardinality).toBe('2');
      expect(modalValues?.maxCardinality).toBe('');
      expect(modalValues?.isRestrictionChecked).toBe(true);

      // Close modal
      await closeEditEdgeModal(page);
    });
  });

  describe('External Property Restriction', () => {
    it('should display cardinality and checked checkbox for external property restriction', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'external-restriction.ttl');
      expect(existsSync(testFile)).toBe(true);

      // Load test file
      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      // Find the edge - external property might have different label format
      const edgeId = await findEdgeInGraph(page, 'Description Element', 'Display Element');
      expect(edgeId).not.toBeNull();
      expect(edgeId).toBeTruthy();

      // Verify edge data in rawData - external property should have full URI
      const edgeData = await page.evaluate(
        (edgeId) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (!testHook) return null;
          return testHook.getEdgeData(edgeId);
        },
        edgeId!
      );
      expect(edgeData).not.toBeNull();
      expect(edgeData?.isRestriction).toBe(true);
      expect(edgeData?.minCardinality).toBe(1);
      expect(edgeData?.type).toContain('describes'); // External property URI

      // Open edit edge modal
      const opened = await openEditEdgeModal(page, edgeId!);
      expect(opened).toBe(true);

      // Get modal values
      const modalValues = await getEditEdgeModalValues(page);
      expect(modalValues).not.toBeNull();

      // Verify values
      expect(modalValues?.minCardinality).toBe('1');
      expect(modalValues?.maxCardinality).toBe('');
      expect(modalValues?.isRestrictionChecked).toBe(true);

      // Close modal
      await closeEditEdgeModal(page);
    });
  });
});
