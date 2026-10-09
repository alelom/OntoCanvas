/**
 * E2E tests for edge style checkboxes (show/hide edges and labels).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { loadTestFile, waitForAppReady, waitForGraphRender } from './testHelpers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const TEST_FIXTURES_DIR = join(__dirname, '../fixtures');

// Helper to get edge count from status bar
async function getEdgeCount(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const edgeCountEl = document.getElementById('edgeCount');
    const count = edgeCountEl?.textContent?.trim() || '0';
    return parseInt(count, 10) || 0;
  });
}

// Helper to check if edge with specific type exists in rawData (before filtering)
async function edgeTypeExistsInRawData(page: Page, edgeType: string): Promise<boolean> {
  return await page.evaluate(
    ({ edgeType }) => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (!testHook || !testHook.getRawDataEdges) return false;
      const edges = testHook.getRawDataEdges();
      if (!edges || edges.length === 0) return false;
      // Check if any edge has the type (exact match or contains)
      return edges.some((e: any) => {
        if (!e || !e.type) return false;
        return e.type === edgeType || e.type.includes(edgeType);
      });
    },
    { edgeType }
  );
}

// Helper to check if edge label checkbox is checked
async function hasEdgeLabel(page: Page, edgeType: string): Promise<boolean> {
  return await page.evaluate(
    ({ edgeType }) => {
      // Try both local name and full URI format
      const escapedType = CSS.escape(edgeType);
      let checkbox = document.querySelector(
        `.edge-label-cb[data-type="${escapedType}"]`
      ) as HTMLInputElement;

      // If not found, try with full URI format
      if (!checkbox && edgeType.includes('#')) {
        const localName = edgeType.split('#').pop() || edgeType;
        const escapedLocal = CSS.escape(localName);
        checkbox = document.querySelector(
          `.edge-label-cb[data-type="${escapedLocal}"]`
        ) as HTMLInputElement;
      }

      // If still not found, try with base URI
      if (!checkbox && !edgeType.includes('http')) {
        const fullUri = `http://example.org/edge-style-test#${edgeType}`;
        const escapedFull = CSS.escape(fullUri);
        checkbox = document.querySelector(
          `.edge-label-cb[data-type="${escapedFull}"]`
        ) as HTMLInputElement;
      }

      // If checkbox is not found, report as not checked so tests fail loudly
      return checkbox ? checkbox.checked : false;
    },
    { edgeType }
  );
}

/** Set an edge-style checkbox (`edge-show-cb` / `edge-label-cb`) and fire its change event; fails if absent. */
async function setEdgeStyleCheckbox(page: Page, cbClass: string, edgeType: string, checked: boolean): Promise<void> {
  const found = await page.evaluate(
    ({ cbClass, edgeType, checked }) => {
      const checkbox = document.querySelector(
        `.${cbClass}[data-type="${CSS.escape(edgeType)}"]`
      ) as HTMLInputElement | null;
      if (!checkbox) return false;
      checkbox.checked = checked;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    { cbClass, edgeType, checked }
  );
  expect(found).toBe(true);
}

// Helper to toggle edge show checkbox
async function toggleEdgeShowCheckbox(page: Page, edgeType: string, checked: boolean): Promise<void> {
  await setEdgeStyleCheckbox(page, 'edge-show-cb', edgeType, checked);
}

// Helper to toggle edge label checkbox
async function toggleEdgeLabelCheckbox(page: Page, edgeType: string, checked: boolean): Promise<void> {
  await setEdgeStyleCheckbox(page, 'edge-label-cb', edgeType, checked);
}

/** Text of the "Edges:" colour legend in the status bar. */
async function getEdgeLegendText(page: Page): Promise<string> {
  return (await page.locator('#edgeColorsLegend').textContent()) ?? '';
}

describe('Edge Style Checkboxes E2E', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(5000);

    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });

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

    // Clear display config (awaited: clearDisplayConfig resolves once IndexedDB is cleared)
    try {
      await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (testHook?.clearDisplayConfig) return testHook.clearDisplayConfig();
      });
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

    // Verify "hasProperty" edge exists in rawData (check both local name and full URI)
    const hasPropertyExistsLocal = await edgeTypeExistsInRawData(page, 'hasProperty');
    const hasPropertyExistsFull = await edgeTypeExistsInRawData(page, 'http://example.org/edge-style-test#hasProperty');
    expect(hasPropertyExistsLocal || hasPropertyExistsFull).toBe(true);

    // Get initial edge count (should be 3: hasProperty, contains, subClassOf)
    const initialEdgeCount = await getEdgeCount(page);
    expect(initialEdgeCount).toBe(3);

    // Find the correct edge type format used in checkboxes
    const edgeTypeInCheckbox = await page.evaluate(() => {
      // Try to find checkbox by checking all edge show checkboxes
      const checkboxes = Array.from(document.querySelectorAll('.edge-show-cb'));
      for (const cb of checkboxes) {
        const type = (cb as HTMLElement).getAttribute('data-type');
        if (type && (type.includes('hasProperty') || type === 'hasProperty')) {
          return type;
        }
      }
      return null;
    });
    expect(edgeTypeInCheckbox).toBeTruthy();

    // Uncheck "Show" checkbox for "hasProperty"
    await toggleEdgeShowCheckbox(page, edgeTypeInCheckbox || 'hasProperty', false);

    // Edge count should be reduced from 3 to 2 (edge is hidden from graph)
    await expect.poll(() => getEdgeCount(page), { timeout: 5000 }).toBe(2);
    await waitForAppReady(page);

    // Edge should still exist in rawData (just hidden from display)
    const stillExistsInRawData = await edgeTypeExistsInRawData(page, 'hasProperty');
    expect(stillExistsInRawData).toBe(true);

    // Re-check "Show" checkbox
    await toggleEdgeShowCheckbox(page, edgeTypeInCheckbox || 'hasProperty', true);

    // Edge count should be restored to 3
    await expect.poll(() => getEdgeCount(page), { timeout: 5000 }).toBe(3);
    await waitForAppReady(page);
  });

  it('should hide edge labels when "Label" checkbox is unchecked', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'edge-style-test.ttl');
    await loadTestFile(page, testFile);
    await waitForGraphRender(page);

    // Verify "contains" edge exists in rawData
    const containsExists = await edgeTypeExistsInRawData(page, 'contains');
    expect(containsExists).toBe(true);

    // Get initial edge count (should remain the same when only label is hidden)
    const initialEdgeCount = await getEdgeCount(page);
    expect(initialEdgeCount).toBe(3);

    // Find the correct edge type format used in checkboxes
    const edgeTypeInCheckbox = await page.evaluate(() => {
      const checkboxes = Array.from(document.querySelectorAll('.edge-label-cb'));
      for (const cb of checkboxes) {
        const type = (cb as HTMLElement).getAttribute('data-type');
        if (type && (type.includes('contains') || type === 'contains')) {
          return type;
        }
      }
      return null;
    });
    expect(edgeTypeInCheckbox).toBeTruthy();

    // Verify label checkbox is checked initially
    const hasLabelBefore = await hasEdgeLabel(page, edgeTypeInCheckbox || 'contains');
    expect(hasLabelBefore).toBe(true);

    // Uncheck "Label" checkbox for "contains"
    await toggleEdgeLabelCheckbox(page, edgeTypeInCheckbox || 'contains', false);
    await expect.poll(() => hasEdgeLabel(page, edgeTypeInCheckbox || 'contains'), { timeout: 5000 }).toBe(false);
    await waitForAppReady(page);

    // Edge count should remain the same (edge is still visible, only label is hidden)
    const edgeCountAfter = await getEdgeCount(page);
    expect(edgeCountAfter).toBe(initialEdgeCount);

    // Re-check "Label" checkbox
    await toggleEdgeLabelCheckbox(page, edgeTypeInCheckbox || 'contains', true);
    await expect.poll(() => hasEdgeLabel(page, edgeTypeInCheckbox || 'contains'), { timeout: 5000 }).toBe(true);
    await waitForAppReady(page);
  });

  it('should hide both edge and label when both checkboxes are unchecked', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'edge-style-test.ttl');
    await loadTestFile(page, testFile);
    await waitForGraphRender(page);

    // Get initial edge count
    const initialEdgeCount = await getEdgeCount(page);
    expect(initialEdgeCount).toBe(3);

    // Uncheck both "Show" and "Label" for "subClassOf"
    await toggleEdgeShowCheckbox(page, 'subClassOf', false);
    await toggleEdgeLabelCheckbox(page, 'subClassOf', false);

    // Edge count should be reduced from 3 to 2 (subClassOf edge is hidden)
    await expect.poll(() => getEdgeCount(page), { timeout: 5000 }).toBe(2);
    await waitForAppReady(page);

    // Verify label checkbox is unchecked
    const hasLabelAfter = await hasEdgeLabel(page, 'subClassOf');
    expect(hasLabelAfter).toBe(false);
  });

  it('should update edge colors legend when checkboxes are toggled', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'edge-style-test.ttl');
    await loadTestFile(page, testFile);
    await waitForGraphRender(page);

    // Find the correct edge type format used in checkboxes
    const edgeTypeInCheckbox = await page.evaluate(() => {
      const checkboxes = Array.from(document.querySelectorAll('.edge-show-cb'));
      for (const cb of checkboxes) {
        const type = (cb as HTMLElement).getAttribute('data-type');
        if (type && (type.includes('hasProperty') || type === 'hasProperty')) {
          return type;
        }
      }
      return null;
    });
    expect(edgeTypeInCheckbox).toBeTruthy();

    // The legend lists every visible relationship type, including "has property".
    await expect.poll(() => getEdgeLegendText(page), { timeout: 5000 }).toMatch(/has property/i);
    const legendBefore = await getEdgeLegendText(page);

    // Uncheck "Show" for "hasProperty": it should drop out of the legend, the other types stay.
    await toggleEdgeShowCheckbox(page, edgeTypeInCheckbox || 'hasProperty', false);
    await expect.poll(() => getEdgeLegendText(page), { timeout: 5000 }).not.toMatch(/has property/i);
    const legendAfter = await getEdgeLegendText(page);
    expect(legendAfter).toMatch(/contains/i);
    expect(legendAfter).not.toEqual(legendBefore);
  });
});
