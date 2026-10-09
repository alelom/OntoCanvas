/**
 * E2E tests for edit edge modal (cardinality, restriction, delete, undo).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { loadTestFile, waitForAppReady, waitForGraphRender } from './testHelpers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const TEST_FIXTURES_DIR = join(__dirname, '../fixtures');

type EdgeData = {
  from: string;
  to: string;
  type: string;
  isRestriction?: boolean;
  minCardinality?: number | null;
  maxCardinality?: number | null;
} | null;

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

/** The edge's data in rawData, or null when the edge does not exist. */
async function readEdge(page: Page, edgeId: string): Promise<EdgeData> {
  return page.evaluate((id) => (window as any).__EDITOR_TEST__?.getEdgeData?.(id) ?? null, edgeId);
}

// Helper function to get edit edge modal values (null while the modal is hidden)
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

/** Wait until the edit edge modal is shown (`true`) or hidden (`false`). */
async function waitForEditEdgeModal(page: Page, shown: boolean): Promise<void> {
  await expect.poll(async () => (await getEditEdgeModalValues(page)) !== null, { timeout: 5000 }).toBe(shown);
}

// Helper function to open edit edge modal; waits until it is shown
async function openEditEdgeModal(page: Page, edgeId: string): Promise<boolean> {
  const result = await page.evaluate(
    (edgeId) => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (!testHook) return false;
      return testHook.editEdge(edgeId);
    },
    edgeId
  );
  if (result) await waitForEditEdgeModal(page, true);
  return result;
}

// Helper function to set edit edge modal values
async function setEditEdgeModalValues(
  page: Page,
  values: {
    isRestrictionChecked?: boolean;
    minCardinality?: string;
    maxCardinality?: string;
  }
): Promise<void> {
  if (values.isRestrictionChecked !== undefined) {
    const checkbox = page.locator('#editEdgeIsRestriction');
    if (values.isRestrictionChecked) {
      await checkbox.check({ timeout: 2000 });
    } else {
      await checkbox.uncheck({ timeout: 2000 });
    }
  }
  if (values.minCardinality !== undefined) {
    await page.locator('#editEdgeMinCard').fill(values.minCardinality, { timeout: 2000 });
  }
  if (values.maxCardinality !== undefined) {
    await page.locator('#editEdgeMaxCard').fill(values.maxCardinality, { timeout: 2000 });
  }
}

// Helper function to confirm edit edge modal; waits for it to close and the graph to re-render
async function confirmEditEdgeModal(page: Page): Promise<void> {
  await page.locator('#editEdgeConfirm').click({ timeout: 2000 });
  await waitForEditEdgeModal(page, false);
  await waitForAppReady(page);
}

// Helper function to close edit edge modal if it is open
async function closeEditEdgeModal(page: Page): Promise<void> {
  if ((await getEditEdgeModalValues(page)) === null) return;
  await page.locator('#editEdgeCancel').click({ timeout: 2000 });
  await waitForEditEdgeModal(page, false);
}

/** Select an edge and wait until the network reports it selected. */
async function selectEdge(page: Page, edgeId: string): Promise<void> {
  await page.evaluate((id) => (window as any).__EDITOR_TEST__.selectEdgeById(id), edgeId);
  await expect
    .poll(() => page.evaluate(() => (window as any).__EDITOR_TEST__.getSelectedEdges()), { timeout: 5000 })
    .toContain(edgeId);
}

describe('Edit Edge Modal E2E Tests', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(5000);

    // Set up console log capture early
    page.on('console', (msg) => {
      const text = msg.text();
      // Log all console messages for debugging
      if (text.includes('[DELETE]') || text.includes('[GET EDGE DATA]') || text.includes('[DELETE KEY]') || text.includes('[TEST]')) {
      }
    });

    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });

    // Enable debug mode for tests to capture all diagnostic logs
    await page.evaluate(() => {
      try {
        localStorage.setItem('ontologyEditorDebug', 'true');
      } catch {
        // localStorage may not be available
      }
    });

    await page.evaluate(() => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    try {
      await page.evaluate(() => (window as any).__EDITOR_TEST__?.clearDisplayConfig?.());
    } catch {
      // IndexedDB may not exist yet
    }
  });

  afterAll(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
  });

  describe('Test Infrastructure', () => {
    it('should be able to capture test logs', async () => {
      // Clear logs first
      await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (testHook?.clearTestLogs) testHook.clearTestLogs();
      });

      // Send a test log message
      await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (testHook?.testLog) {
          testHook.testLog('Test log message 1');
          testHook.testLog('Test log message 2');
        }
      });

      // Retrieve logs
      const logs = await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (!testHook) return [];
        return testHook.getTestLogs ? testHook.getTestLogs() : [];
      });

      expect(logs.length).toBeGreaterThanOrEqual(2);
      expect(logs.some(log => log.includes('Test log message 1'))).toBe(true);
      expect(logs.some(log => log.includes('Test log message 2'))).toBe(true);
    });

    it('should capture DELETE logs when deletion is performed', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'restriction-edge-test.ttl');
      expect(existsSync(testFile)).toBe(true);

      // Load test file
      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      // Find and select the edge
      const edgeId = await findEdgeInGraph(page, 'Class A', 'Class B', 'has property');
      expect(edgeId).not.toBeNull();

      // Clear logs
      await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (testHook?.clearTestLogs) testHook.clearTestLogs();
      });

      await selectEdge(page, edgeId!);

      // Delete the edge
      await page.keyboard.press('Delete');
      await expect.poll(() => readEdge(page, edgeId!), { timeout: 5000 }).toBeNull();
      await waitForAppReady(page);

      // Get logs
      const logs = await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (!testHook) return [];
        return testHook.getTestLogs ? testHook.getTestLogs('[DELETE]') : [];
      });

      // Verify we captured DELETE logs
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some(log => log.includes('performDeleteSelection called'))).toBe(true);
    });
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
      const edgeData = await readEdge(page, edgeId!);
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
      const edgeData = await readEdge(page, edgeId!);
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

  describe('Edit edge modal keyboard', () => {
    it('closes Edit edge modal without saving when Escape is pressed', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'simple-restriction.ttl');
      expect(existsSync(testFile)).toBe(true);

      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      const edgeId = await findEdgeInGraph(page, 'Class A', 'Class B', 'has property');
      expect(edgeId).not.toBeNull();

      const opened = await openEditEdgeModal(page, edgeId!);
      expect(opened).toBe(true);

      let modalValues = await getEditEdgeModalValues(page);
      expect(modalValues).not.toBeNull();
      expect(modalValues?.minCardinality).toBe('2');

      // Change a value but do not confirm
      await setEditEdgeModalValues(page, { minCardinality: '9' });

      // Press Escape to close without saving
      await page.keyboard.press('Escape');

      // Modal should be closed
      await waitForEditEdgeModal(page, false);

      // Re-open same edge: original values should be unchanged (no save)
      const reopened = await openEditEdgeModal(page, edgeId!);
      expect(reopened).toBe(true);
      modalValues = await getEditEdgeModalValues(page);
      expect(modalValues).not.toBeNull();
      expect(modalValues?.minCardinality).toBe('2');

      await closeEditEdgeModal(page);
    });
  });

  describe('Add Node duplicate identifier', () => {
    it('disables OK and shows error when label would derive to an existing identifier', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'duplicate-add-node.ttl');
      expect(existsSync(testFile)).toBe(true);

      await loadTestFile(page, testFile);

      const nodeCountBefore = await page.evaluate(() => (window as any).__EDITOR_TEST__?.getNodeCount?.() ?? 0);
      expect(nodeCountBefore).toBe(1);

      await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (testHook?.openAddNodeModal) testHook.openAddNodeModal(100, 100);
      });

      await expect.poll(() => page.locator('#addNodeModal').isVisible(), { timeout: 5000 }).toBe(true);

      await page.locator('#addNodeInput').fill('DGU');

      const readState = () =>
        page.evaluate(() => {
          const testHook = (window as any).__EDITOR_TEST__;
          return testHook?.getAddNodeModalState?.() ?? null;
        });
      await expect.poll(async () => (await readState())?.duplicateErrorVisible, { timeout: 5000 }).toBe(true);
      const state = await readState();
      expect(state).not.toBeNull();
      expect(state?.okDisabled).toBe(true);
      expect(state?.duplicateErrorVisible).toBe(true);
      expect(state?.duplicateErrorText).toContain('same identifier');

      const nodeCountAfter = await page.evaluate(() => (window as any).__EDITOR_TEST__?.getNodeCount?.() ?? 0);
      expect(nodeCountAfter).toBe(1);
    });
  });

  describe('Edit edge to OWL restriction with cardinality', () => {
    it('ticking OWL restriction and setting cardinality then OK reflects in graph and TTL', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'edit-edge-to-restriction.ttl');
      expect(existsSync(testFile)).toBe(true);

      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      const edgeId = await findEdgeInGraph(page, 'Source', 'Target', 'contains');
      expect(edgeId).not.toBeNull();

      const opened = await openEditEdgeModal(page, edgeId!);
      expect(opened).toBe(true);

      await page.locator('#editEdgeIsRestriction').check();
      await page.locator('#editEdgeMinCard').fill('0');
      await page.locator('#editEdgeMaxCard').fill('3');

      await page.locator('#editEdgeConfirm').click();

      // Wait for the edit to be applied rather than sleeping (#93).
      await expect.poll(async () => (await readEdge(page, edgeId!))?.isRestriction, { timeout: 5000 }).toBe(true);
      const edgeData = await readEdge(page, edgeId!);
      expect(edgeData).not.toBeNull();
      expect(edgeData?.isRestriction).toBe(true);
      expect(edgeData?.minCardinality).toBe(0);
      expect(edgeData?.maxCardinality).toBe(3);

      const ttl = await page.evaluate(() => (window as any).__EDITOR_TEST__?.getSerializedTurtle?.());
      expect(ttl).not.toBeNull();
      expect(ttl).toContain('minQualifiedCardinality');
      expect(ttl).toContain('maxQualifiedCardinality');
    });
  });

  describe('Unchecking OWL Restriction', () => {
    it('should remove restriction but keep edge when unchecking isRestriction checkbox', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'restriction-edge-test.ttl');
      expect(existsSync(testFile)).toBe(true);

      // Load test file
      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      // Find the edge (should be a restriction)
      const edgeId = await findEdgeInGraph(page, 'Class A', 'Class B', 'has property');
      expect(edgeId).not.toBeNull();

      // Verify it's a restriction initially
      const initialEdgeData = await readEdge(page, edgeId!);
      expect(initialEdgeData).not.toBeNull();
      expect(initialEdgeData?.isRestriction).toBe(true);

      // Open edit edge modal
      const opened = await openEditEdgeModal(page, edgeId!);
      expect(opened).toBe(true);

      // Verify checkbox is checked
      const initialModalValues = await getEditEdgeModalValues(page);
      expect(initialModalValues).not.toBeNull();
      expect(initialModalValues?.isRestrictionChecked).toBe(true);

      // Uncheck the "is restriction" checkbox
      await setEditEdgeModalValues(page, { isRestrictionChecked: false });

      // Verify checkbox is now unchecked
      const updatedModalValues = await getEditEdgeModalValues(page);
      expect(updatedModalValues).not.toBeNull();
      expect(updatedModalValues?.isRestrictionChecked).toBe(false);

      // Confirm the edit
      await confirmEditEdgeModal(page);

      // Verify edge still exists but is no longer a restriction
      await expect.poll(async () => (await readEdge(page, edgeId!))?.isRestriction, { timeout: 5000 }).toBe(false);
      const afterUncheckEdgeData = await readEdge(page, edgeId!);
      expect(afterUncheckEdgeData).not.toBeNull();
      expect(afterUncheckEdgeData?.isRestriction).toBe(false);

      // Verify TTL no longer has the restriction
      const ttl = await page.evaluate(() => (window as any).__EDITOR_TEST__?.getSerializedTurtle?.());
      expect(ttl).not.toBeNull();
      expect(ttl).not.toContain('owl:Restriction');
      expect(ttl).not.toContain('owl:onProperty');
      expect(ttl).not.toContain('owl:someValuesFrom');
      // But domain/range should still be there
      expect(ttl).toContain('rdfs:domain');
      expect(ttl).toContain('rdfs:range');
    });

    it('should restore restriction when undoing uncheck operation', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'restriction-edge-test.ttl');
      expect(existsSync(testFile)).toBe(true);

      // Load test file
      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      // Find the edge
      const edgeId = await findEdgeInGraph(page, 'Class A', 'Class B', 'has property');
      expect(edgeId).not.toBeNull();

      // Open edit edge modal and uncheck restriction
      const opened = await openEditEdgeModal(page, edgeId!);
      expect(opened).toBe(true);
      await setEditEdgeModalValues(page, { isRestrictionChecked: false });
      await confirmEditEdgeModal(page);

      // Verify edge is no longer a restriction
      await expect.poll(async () => (await readEdge(page, edgeId!))?.isRestriction, { timeout: 5000 }).toBe(false);

      // Perform undo
      await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (testHook?.performUndo) testHook.performUndo();
      });

      // Verify edge is back as a restriction
      await expect.poll(async () => (await readEdge(page, edgeId!))?.isRestriction, { timeout: 5000 }).toBe(true);
      await waitForAppReady(page);
    });

    it('should delete edge completely when using Del key (not just remove restriction)', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'restriction-edge-test.ttl');
      expect(existsSync(testFile)).toBe(true);

      // Load test file
      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      // Find the edge
      const edgeId = await findEdgeInGraph(page, 'Class A', 'Class B', 'has property');
      expect(edgeId).not.toBeNull();

      await selectEdge(page, edgeId!);

      // Delete the edge using Del key
      await page.keyboard.press('Delete');

      // Verify edge is completely gone
      await expect.poll(() => readEdge(page, edgeId!), { timeout: 5000 }).toBeNull();
      await waitForAppReady(page);

      // Verify TTL no longer has domain/range for this property
      const ttl = await page.evaluate(() => (window as any).__EDITOR_TEST__?.getSerializedTurtle?.());
      expect(ttl).not.toBeNull();
      // The property should still exist, but without domain/range
      expect(ttl).toContain('hasProperty');
      // Check if domain/range still exists for hasProperty specifically
      const hasPropertyDomainRange = /hasProperty[^;]*rdfs:domain|hasProperty[^;]*rdfs:range/.test(ttl);
      expect(hasPropertyDomainRange).toBe(false);
    });

    it('should restore edge when undoing deletion', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'restriction-edge-test.ttl');
      expect(existsSync(testFile)).toBe(true);

      // Load test file
      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      // Find the edge
      const edgeId = await findEdgeInGraph(page, 'Class A', 'Class B', 'has property');
      expect(edgeId).not.toBeNull();

      // Select and delete the edge
      await selectEdge(page, edgeId!);
      await page.keyboard.press('Delete');

      // Verify edge is gone
      await expect.poll(() => readEdge(page, edgeId!), { timeout: 5000 }).toBeNull();
      await waitForAppReady(page);

      // Perform undo
      await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (testHook?.performUndo) testHook.performUndo();
      });

      // Verify edge is restored as a restriction
      await expect.poll(async () => (await readEdge(page, edgeId!))?.isRestriction, { timeout: 5000 }).toBe(true);
      await waitForAppReady(page);
    });
  });

  describe('Node Deletion with Connected Edges', () => {
    it('should delete connected edges when deleting a node, handling exceptions gracefully', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'restriction-edge-test.ttl');
      expect(existsSync(testFile)).toBe(true);

      // Load test file
      await loadTestFile(page, testFile);
      await waitForGraphRender(page);

      // Verify edge exists before deletion
      const edgeId = await findEdgeInGraph(page, 'Class A', 'Class B', 'has property');
      expect(edgeId).not.toBeNull();
      expect(await readEdge(page, edgeId!)).not.toBeNull();

      const nodeIds = await page.evaluate(() => (window as any).__EDITOR_TEST__.getNodeIds());
      expect(nodeIds).toContain('ClassA');

      // Select the node and wait until the network reports it selected
      await page.evaluate(() => (window as any).__EDITOR_TEST__.selectNodeById('ClassA'));
      await expect
        .poll(() => page.evaluate(() => (window as any).__EDITOR_TEST__.getSelectedNodes()), { timeout: 5000 })
        .toContain('ClassA');

      // Delete the node (this should also delete connected edges)
      await page.keyboard.press('Delete');

      // Verify node is gone
      await expect
        .poll(() => page.evaluate(() => (window as any).__EDITOR_TEST__.getNodeIds()), { timeout: 5000 })
        .not.toContain('ClassA');
      await waitForAppReady(page);

      // Verify connected edge is also gone (even if removeEdgeFromStore threw an exception)
      expect(await readEdge(page, edgeId!)).toBeNull();

      // Verify TTL no longer has the edge
      const ttl = await page.evaluate(() => (window as any).__EDITOR_TEST__?.getSerializedTurtle?.());
      expect(ttl).not.toBeNull();
      // ClassA should be gone
      expect(ttl).not.toContain('ClassA');
      // The property should still exist, but without domain/range pointing to ClassA
      expect(ttl).toContain('hasProperty');
    });
  });
});
