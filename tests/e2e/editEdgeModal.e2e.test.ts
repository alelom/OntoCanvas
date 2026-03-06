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
  // Wait for the graph to render. The counts can be 0 (e.g., after deleting all nodes/edges),
  // so we check that the elements exist and have valid numeric values (including 0).
  // Note: This is NOT a timing issue - the function was incorrectly requiring non-zero counts,
  // which would cause infinite waits when the last node/edge was deleted.
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
    if (await checkbox.isVisible({ timeout: 2000 }).catch(() => false)) {
      if (values.isRestrictionChecked) {
        await checkbox.check({ timeout: 2000 });
      } else {
        await checkbox.uncheck({ timeout: 2000 });
      }
      await page.waitForTimeout(100);
    }
  }
  if (values.minCardinality !== undefined) {
    const minInput = page.locator('#editEdgeMinCard');
    if (await minInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await minInput.fill(values.minCardinality, { timeout: 2000 });
      await page.waitForTimeout(50);
    }
  }
  if (values.maxCardinality !== undefined) {
    const maxInput = page.locator('#editEdgeMaxCard');
    if (await maxInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await maxInput.fill(values.maxCardinality, { timeout: 2000 });
      await page.waitForTimeout(50);
    }
  }
}

// Helper function to confirm edit edge modal
async function confirmEditEdgeModal(page: Page): Promise<void> {
  const confirmBtn = page.locator('#editEdgeConfirm');
  if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await confirmBtn.click({ timeout: 2000 });
    await page.waitForTimeout(200); // Wait for modal to close and graph to update
  }
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
    
    // Set up console log capture early
    page.on('console', (msg) => {
      const text = msg.text();
      // Log all console messages for debugging
      if (text.includes('[DELETE]') || text.includes('[GET EDGE DATA]') || text.includes('[DELETE KEY]') || text.includes('[TEST]')) {
        console.log(`[BROWSER CONSOLE] ${msg.type()}: ${text}`);
      }
    });
    
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, { timeout: 5000 });
    await page.waitForTimeout(250);
    
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

      await page.waitForTimeout(100);

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

      // Select edge
      const selectionResult = await page.evaluate(
        (edgeId) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (!testHook) return { success: false };
          return { success: testHook.selectEdgeById(edgeId) };
        },
        edgeId!
      );
      expect(selectionResult.success).toBe(true);
      await page.waitForTimeout(200);

      // Delete the edge
      await page.keyboard.press('Delete');
      await waitForGraphRender(page);
      await page.waitForTimeout(500);

      // Get logs
      const logs = await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (!testHook) return [];
        return testHook.getTestLogs ? testHook.getTestLogs('[DELETE]') : [];
      });

      // Verify we captured DELETE logs
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some(log => log.includes('performDeleteSelection called'))).toBe(true);
      console.log('Captured DELETE logs:', logs);
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

  describe('Add Node duplicate identifier', () => {
    it('disables OK and shows error when label would derive to an existing identifier', async () => {
      const testFile = join(TEST_FIXTURES_DIR, 'duplicate-add-node.ttl');
      expect(existsSync(testFile)).toBe(true);

      await loadTestFile(page, testFile);
      await page.waitForFunction(
        () => {
          const nodeCountEl = document.getElementById('nodeCount');
          const n = nodeCountEl?.textContent?.trim();
          return n !== undefined && n !== '' && parseInt(n, 10) >= 1;
        },
        { timeout: 5000 }
      );
      await page.waitForTimeout(100);

      const nodeCountBefore = await page.evaluate(() => (window as any).__EDITOR_TEST__?.getNodeCount?.() ?? 0);
      expect(nodeCountBefore).toBe(1);

      await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (testHook?.openAddNodeModal) testHook.openAddNodeModal(100, 100);
      });
      await page.waitForTimeout(150);

      const modalVisible = await page.locator('#addNodeModal').isVisible();
      expect(modalVisible).toBe(true);

      await page.locator('#addNodeInput').fill('DGU');
      await page.waitForTimeout(100);

      const state = await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        return testHook?.getAddNodeModalState?.() ?? null;
      });
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
      await page.waitForTimeout(150);

      const isRestrictionCb = page.locator('#editEdgeIsRestriction');
      await isRestrictionCb.check();
      await page.waitForTimeout(80);

      await page.locator('#editEdgeMinCard').fill('0');
      await page.locator('#editEdgeMaxCard').fill('3');
      await page.waitForTimeout(80);

      await page.locator('#editEdgeConfirm').click();
      await page.waitForTimeout(300);

      const edgeData = await page.evaluate(
        (id) => (window as any).__EDITOR_TEST__?.getEdgeData?.(id) ?? null,
        edgeId!
      );
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
      const initialEdgeData = await page.evaluate(
        (edgeId) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (!testHook) return null;
          return testHook.getEdgeData(edgeId);
        },
        edgeId!
      );
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
      await page.waitForTimeout(100);

      // Verify checkbox is now unchecked
      const updatedModalValues = await getEditEdgeModalValues(page);
      expect(updatedModalValues).not.toBeNull();
      expect(updatedModalValues?.isRestrictionChecked).toBe(false);

      // Confirm the edit
      await confirmEditEdgeModal(page);
      await waitForGraphRender(page);

      // Verify edge still exists but is no longer a restriction
      const afterUncheckEdgeData = await page.evaluate(
        (edgeId) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (!testHook) return null;
          return testHook.getEdgeData(edgeId);
        },
        edgeId!
      );
      expect(afterUncheckEdgeData).not.toBeNull();
      expect(afterUncheckEdgeData?.isRestriction).toBe(false);

      // Verify the edge is still visible in the graph
      const edgeStillExists = await page.evaluate(
        (edgeId) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (!testHook) return null;
          return testHook.getEdgeData(edgeId) !== null;
        },
        edgeId!
      );
      expect(edgeStillExists).toBe(true);

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
      await waitForGraphRender(page);

      // Verify edge is no longer a restriction
      const afterUncheck = await page.evaluate(
        (edgeId) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (!testHook) return null;
          return testHook.getEdgeData(edgeId);
        },
        edgeId!
      );
      expect(afterUncheck?.isRestriction).toBe(false);

      // Perform undo
      await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (testHook?.performUndo) testHook.performUndo();
      });
      await waitForGraphRender(page);

      // Verify edge is back as a restriction
      const afterUndo = await page.evaluate(
        (edgeId) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (!testHook) return null;
          return testHook.getEdgeData(edgeId);
        },
        edgeId!
      );
      expect(afterUndo).not.toBeNull();
      expect(afterUndo?.isRestriction).toBe(true);
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

      // Select the edge using the test hook
      const selectionResult = await page.evaluate(
        (edgeId) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (!testHook) return { success: false, error: 'testHook not found' };
          if (!testHook.selectEdgeById) return { success: false, error: 'selectEdgeById not found' };
          const success = testHook.selectEdgeById(edgeId);
          return { success, edgeId };
        },
        edgeId!
      );
      console.log('Selection result:', selectionResult);
      expect(selectionResult.success).toBe(true);
      // Wait for selection to be applied and verify it persists
      await page.waitForTimeout(300);
      
      // Verify selection is still there before deletion using test hook
      const selectionBeforeDelete = await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (!testHook) return null;
        return {
          selectedEdges: testHook.getSelectedEdges ? testHook.getSelectedEdges() : [],
          selectedNodes: testHook.getSelectedNodes ? testHook.getSelectedNodes() : [],
        };
      });
      console.log('Selection before delete:', selectionBeforeDelete);
      
      // If selection is lost, try selecting again
      if (!selectionBeforeDelete || selectionBeforeDelete.selectedEdges.length === 0) {
        console.log('Selection lost, reselecting...');
        const reselectResult = await page.evaluate(
          (edgeId) => {
            const testHook = (window as any).__EDITOR_TEST__;
            if (!testHook) return { success: false };
            return { success: testHook.selectEdgeById(edgeId) };
          },
          edgeId!
        );
        console.log('Reselection result:', reselectResult);
        await page.waitForTimeout(300);
        
        // Verify selection again
        const reselectionCheck = await page.evaluate(() => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (!testHook) return { selectedEdges: [] };
          return {
            selectedEdges: testHook.getSelectedEdges ? testHook.getSelectedEdges() : [],
          };
        });
        console.log('After reselection:', reselectionCheck);
      }

      // Clear test logs before deletion
      await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (testHook?.clearTestLogs) testHook.clearTestLogs();
      });

      // Delete the edge using Del key
      await page.keyboard.press('Delete');
      await waitForGraphRender(page);
      await page.waitForTimeout(500); // Extra wait for deletion to complete

      // Get test logs from the browser
      const testLogs = await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (!testHook) return [];
        return testHook.getTestLogs ? testHook.getTestLogs() : [];
      });
      console.log('Test logs from deletion:', testLogs);

      // Get all edges to see what's in rawData
      const allEdges = await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (!testHook) return [];
        return testHook.getAllEdges ? testHook.getAllEdges() : [];
      });
      console.log('All edges in rawData after deletion:', allEdges);

      // Verify edge is completely gone
      const afterDelete = await page.evaluate(
        (edgeId) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (!testHook) return null;
          return testHook.getEdgeData(edgeId);
        },
        edgeId!
      );
      
      if (afterDelete) {
        console.log('Edge still exists after deletion:', afterDelete);
        console.log('All edges:', allEdges);
        console.log('Test logs:', testLogs);
      }
      
      expect(afterDelete).toBeNull();

      // Verify TTL no longer has domain/range for this property
      const ttl = await page.evaluate(() => (window as any).__EDITOR_TEST__?.getSerializedTurtle?.());
      expect(ttl).not.toBeNull();
      // The property should still exist, but without domain/range
      expect(ttl).toContain('hasProperty');
      // Domain/range should be removed
      const hasDomainRange = ttl.includes('rdfs:domain') && ttl.includes('rdfs:range');
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

      // Select and delete the edge using test hook
      const selectionResult = await page.evaluate(
        (edgeId) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (!testHook) return { success: false };
          return { success: testHook.selectEdgeById(edgeId) };
        },
        edgeId!
      );
      expect(selectionResult.success).toBe(true);
      await page.waitForTimeout(300);
      await page.keyboard.press('Delete');
      await waitForGraphRender(page);

      // Verify edge is gone
      const afterDelete = await page.evaluate(
        (edgeId) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (!testHook) return null;
          return testHook.getEdgeData(edgeId);
        },
        edgeId!
      );
      expect(afterDelete).toBeNull();

      // Perform undo
      await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (testHook?.performUndo) testHook.performUndo();
      });
      await waitForGraphRender(page);

      // Verify edge is restored as a restriction
      const afterUndo = await page.evaluate(
        (edgeId) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (!testHook) return null;
          return testHook.getEdgeData(edgeId);
        },
        edgeId!
      );
      expect(afterUndo).not.toBeNull();
      expect(afterUndo?.isRestriction).toBe(true);
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

      const edgeDataBefore = await page.evaluate(
        (edgeId) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (!testHook) return null;
          return testHook.getEdgeData(edgeId);
        },
        edgeId!
      );
      expect(edgeDataBefore).not.toBeNull();

      // Find and select ClassA node
      const nodeId = await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (!testHook) return null;
        const nodes = testHook.getNodeIds();
        // Find ClassA node (should be in the list)
        const classANode = nodes.find((id: string) => id === 'ClassA');
        return classANode || null;
      });
      expect(nodeId).not.toBeNull();

      // Select the node using test hook
      const nodeSelectionResult = await page.evaluate(
        (nodeId) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (!testHook) return { success: false };
          return { success: testHook.selectNodeByLabel ? testHook.selectNodeByLabel(nodeId) : false };
        },
        'Class A' // Use label instead of ID
      );
      // If selectNodeByLabel doesn't work, try direct network access
      if (!nodeSelectionResult.success) {
        await page.evaluate(
          (nodeId) => {
            const network = (window as any).network;
            if (network && network.setSelection) {
              network.setSelection({ nodes: [nodeId] });
            }
          },
          nodeId!
        );
      }
      await page.waitForTimeout(300);

      // Delete the node (this should also delete connected edges)
      await page.keyboard.press('Delete');
      await waitForGraphRender(page);
      await page.waitForTimeout(200);

      // Verify node is gone
      const nodeIdsAfter = await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        if (!testHook) return [];
        return testHook.getNodeIds();
      });
      expect(nodeIdsAfter).not.toContain('ClassA');

      // Verify connected edge is also gone (even if removeEdgeFromStore threw an exception)
      const edgeDataAfter = await page.evaluate(
        (edgeId) => {
          const testHook = (window as any).__EDITOR_TEST__;
          if (!testHook) return null;
          return testHook.getEdgeData(edgeId);
        },
        edgeId!
      );
      expect(edgeDataAfter).toBeNull();

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
