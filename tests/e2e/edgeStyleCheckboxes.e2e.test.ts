/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
  await page.waitForTimeout(500);
}

async function waitForGraphRender(page: Page, timeout = 4000): Promise<void> {
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
  await page.waitForTimeout(200);
}

// Helper to get edge count from status bar
async function getEdgeCount(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const edgeCountEl = document.getElementById('edgeCount');
    const count = edgeCountEl?.textContent?.trim() || '0';
    return parseInt(count, 10) || 0;
  });
}

// Helper to check if edge with specific type is visible by checking the network
async function isEdgeTypeVisible(page: Page, edgeType: string): Promise<boolean> {
  return await page.evaluate(
    ({ edgeType }) => {
      const network = (window as any).network;
      if (!network || !network.body || !network.body.data) return false;
      const edges = network.body.data.edges;
      if (!edges || edges.length === 0) return false;
      // Check if any edge has the type in its id (format: from->to:type)
      return edges.some((e: any) => {
        if (!e || !e.id) return false;
        return typeof e.id === 'string' && e.id.includes(edgeType);
      });
    },
    { edgeType }
  );
}

// Helper to check if edge label is visible by checking the network
async function hasEdgeLabel(page: Page, edgeType: string): Promise<boolean> {
  return await page.evaluate(
    ({ edgeType }) => {
      const network = (window as any).network;
      if (!network || !network.body || !network.body.data) return false;
      const edges = network.body.data.edges;
      if (!edges || edges.length === 0) return false;
      // Find edge by matching id (which contains the type)
      const edge = edges.find((e: any) => {
        if (!e || !e.id) return false;
        return typeof e.id === 'string' && e.id.includes(edgeType);
      });
      return edge && edge.label && typeof edge.label === 'string' && edge.label.trim() !== '';
    },
    { edgeType }
  );
}

// Helper to toggle edge show checkbox
async function toggleEdgeShowCheckbox(page: Page, edgeType: string, checked: boolean): Promise<void> {
  await page.evaluate(
    ({ edgeType, checked }) => {
      const escapedType = CSS.escape(edgeType);
      const checkbox = document.querySelector(
        `.edge-show-cb[data-type="${escapedType}"]`
      ) as HTMLInputElement;
      if (checkbox) {
        checkbox.checked = checked;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
    },
    { edgeType, checked }
  );
  await page.waitForTimeout(200);
}

// Helper to toggle edge label checkbox
async function toggleEdgeLabelCheckbox(page: Page, edgeType: string, checked: boolean): Promise<void> {
  await page.evaluate(
    ({ edgeType, checked }) => {
      const escapedType = CSS.escape(edgeType);
      const checkbox = document.querySelector(
        `.edge-label-cb[data-type="${escapedType}"]`
      ) as HTMLInputElement;
      if (checkbox) {
        checkbox.checked = checked;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
    },
    { edgeType, checked }
  );
  await page.waitForTimeout(200);
}

describe('Edge Style Checkboxes E2E', () => {
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
    
    // Enable debug mode for test logging
    await page.evaluate(() => {
      try {
        localStorage.setItem('ontologyEditorDebug', 'true');
      } catch {
        // localStorage may not be available
      }
    });
    
    // Hide open ontology modal
    await page.evaluate(() => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);
    
    // Clear display config
    try {
      await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (testHook?.clearDisplayConfig) return testHook.clearDisplayConfig();
      });
      await page.waitForTimeout(50);
    } catch {
      // IndexedDB may not exist yet
    }
  });

  afterAll(async () => {
    await browser.close();
  });

  it('should hide edges when "Show" checkbox is unchecked', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'edge-style-test.ttl');
    await loadTestFile(page, testFile);
    await waitForGraphRender(page);
    
    // Wait a bit more for network to fully initialize
    await page.waitForTimeout(500);

    // Get initial edge count
    const initialEdgeCount = await getEdgeCount(page);
    
    // Debug: log network state
    const debugInfo = await page.evaluate(() => {
      const network = (window as any).network;
      const testHook = (window as any).__EDITOR_TEST__;
      return {
        hasNetwork: !!network,
        hasBody: !!(network && network.body),
        hasData: !!(network && network.body && network.body.data),
        edgeCount: network && network.body && network.body.data && network.body.data.edges ? network.body.data.edges.length : 0,
        nodeCount: network && network.body && network.body.data && network.body.data.nodes ? network.body.data.nodes.length : 0,
        rawDataEdgeCount: testHook ? testHook.getRawDataEdges?.()?.length : null,
      };
    });
    console.log('Debug info:', debugInfo);
    
    expect(initialEdgeCount).toBeGreaterThan(0);

    // Verify "hasProperty" edges are visible initially
    const hasPropertyVisibleBefore = await isEdgeTypeVisible(page, 'hasProperty');
    expect(hasPropertyVisibleBefore).toBe(true);

    // Uncheck "Show" checkbox for "hasProperty"
    await toggleEdgeShowCheckbox(page, 'hasProperty', false);
    await waitForGraphRender(page);

    // Verify "hasProperty" edges are now hidden
    const hasPropertyVisibleAfter = await isEdgeTypeVisible(page, 'hasProperty');
    expect(hasPropertyVisibleAfter).toBe(false);

    // Edge count should be reduced
    const edgeCountAfter = await getEdgeCount(page);
    expect(edgeCountAfter).toBeLessThan(initialEdgeCount);

    // Re-check "Show" checkbox
    await toggleEdgeShowCheckbox(page, 'hasProperty', true);
    await waitForGraphRender(page);

    // Verify "hasProperty" edges are visible again
    const hasPropertyVisibleRestored = await isEdgeTypeVisible(page, 'hasProperty');
    expect(hasPropertyVisibleRestored).toBe(true);
  });

  it('should hide edge labels when "Label" checkbox is unchecked', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'edge-style-test.ttl');
    await loadTestFile(page, testFile);
    await waitForGraphRender(page);
    await page.waitForTimeout(500);

    // Get initial edge count (should remain the same when only label is hidden)
    const initialEdgeCount = await getEdgeCount(page);
    expect(initialEdgeCount).toBeGreaterThan(0);

    // Verify "contains" edge is visible initially
    const edgeVisibleBefore = await isEdgeTypeVisible(page, 'contains');
    expect(edgeVisibleBefore).toBe(true);

    // Uncheck "Label" checkbox for "contains"
    await toggleEdgeLabelCheckbox(page, 'contains', false);
    await waitForGraphRender(page);
    await page.waitForTimeout(500);

    // Edge should still be visible (only label is hidden)
    const edgeVisibleAfter = await isEdgeTypeVisible(page, 'contains');
    expect(edgeVisibleAfter).toBe(true);

    // Edge count should remain the same
    const edgeCountAfter = await getEdgeCount(page);
    expect(edgeCountAfter).toBe(initialEdgeCount);

    // Verify label is hidden by checking the network
    const hasLabelAfter = await hasEdgeLabel(page, 'contains');
    expect(hasLabelAfter).toBe(false);

    // Re-check "Label" checkbox
    await toggleEdgeLabelCheckbox(page, 'contains', true);
    await waitForGraphRender(page);
    await page.waitForTimeout(500);

    // Verify label is visible again
    const hasLabelRestored = await hasEdgeLabel(page, 'contains');
    expect(hasLabelRestored).toBe(true);
  });

  it('should hide both edge and label when both checkboxes are unchecked', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'edge-style-test.ttl');
    await loadTestFile(page, testFile);
    await waitForGraphRender(page);

    // Get initial edge count
    const initialEdgeCount = await getEdgeCount(page);

    // Uncheck both "Show" and "Label" for "subClassOf"
    await toggleEdgeShowCheckbox(page, 'subClassOf', false);
    await waitForGraphRender(page);

    // Verify "subClassOf" edges are hidden
    const subClassOfVisible = await isEdgeTypeVisible(page, 'subClassOf');
    expect(subClassOfVisible).toBe(false);

    // Edge count should be reduced
    const edgeCountAfter = await getEdgeCount(page);
    expect(edgeCountAfter).toBeLessThan(initialEdgeCount);
  });

  it('should update edge colors legend when checkboxes are toggled', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'edge-style-test.ttl');
    await loadTestFile(page, testFile);
    await waitForGraphRender(page);

    // Get initial legend text
    const legendBefore = await page.evaluate(() => {
      const statusBar = document.getElementById('statusBar');
      return statusBar?.textContent || '';
    });

    // Uncheck "Show" for "hasProperty"
    await toggleEdgeShowCheckbox(page, 'hasProperty', false);
    await waitForGraphRender(page);

    // Get legend text after
    const legendAfter = await page.evaluate(() => {
      const statusBar = document.getElementById('statusBar');
      return statusBar?.textContent || '';
    });

    // Legend should be updated (should not contain "hasProperty" anymore)
    expect(legendAfter).not.toContain('hasProperty');
    expect(legendBefore).not.toEqual(legendAfter);
  });
});
