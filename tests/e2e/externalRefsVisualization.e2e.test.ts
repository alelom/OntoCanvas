/**
 * E2E test: Display external ontology references in the graph (Person, Project, Organisation from project-mgmt
 * when viewing task-assignment). Checks "Display external references" and that node count increases.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = process.env.EDITOR_URL || process.env.EDITOR_E2E_URL || 'http://localhost:5173/';
const FIXTURES_DIR = join(__dirname, '../fixtures');

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

async function getNodeCount(page: Page): Promise<number> {
  await page.waitForTimeout(300);
  const text = await page.locator('#nodeCount').textContent();
  const n = parseInt(text ?? '0', 10);
  return Number.isFinite(n) ? n : 0;
}

describe('External refs visualization E2E', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(5000);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('#openOntologyBtn').waitFor({ state: 'visible', timeout: 5000 });
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  it('shows external class nodes by default (Display external references ON)', async () => {
    await page.waitForFunction(() => (window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ !== undefined, { timeout: 5000 });
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);

    const taskAssignmentPath = join(FIXTURES_DIR, 'externalRefs-task-assignment.ttl');
    await loadTestFile(page, taskAssignmentPath);

    await page.locator('#vizControls').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(800);
    const nodeCount = await getNodeCount(page);
    expect(nodeCount).toBeGreaterThanOrEqual(5);
  }, 10000);

  it('undo restores store and edges after deleting an external node', async () => {
    await page.waitForFunction(() => (window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ !== undefined, { timeout: 5000 });
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);

    const taskAssignmentPath = join(FIXTURES_DIR, 'externalRefs-task-assignment.ttl');
    await loadTestFile(page, taskAssignmentPath);
    await page.locator('#vizControls').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(800);

    const countBefore = await getNodeCount(page);
    expect(countBefore).toBeGreaterThanOrEqual(5);

    const externalPersonUri = 'http://example.org/project-mgmt#Person';
    const selected = await page.evaluate((id: string) => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { selectNodeById?: (nodeId: string) => boolean } }).__EDITOR_TEST__;
      return testHook?.selectNodeById?.(id) ?? false;
    }, externalPersonUri);
    expect(selected).toBe(true);

    await page.waitForTimeout(200);
    const deleted = await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { performDelete?: () => boolean } }).__EDITOR_TEST__;
      return testHook?.performDelete?.() ?? false;
    });
    expect(deleted).toBe(true);
    await page.waitForTimeout(500);
    const countAfterDelete = await getNodeCount(page);
    expect(countAfterDelete).toBeLessThan(countBefore);

    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { performUndo?: () => void } }).__EDITOR_TEST__;
      testHook?.performUndo?.();
    });
    await page.waitForTimeout(500);
    const countAfterUndo = await getNodeCount(page);
    expect(countAfterUndo).toBe(countBefore);
  }, 10000);

  it('Edit Edge modal shows correct From/To and relationship for edge to external node', async () => {
    await page.waitForFunction(() => (window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ !== undefined, { timeout: 5000 });
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);

    const taskAssignmentPath = join(FIXTURES_DIR, 'externalRefs-task-assignment.ttl');
    await loadTestFile(page, taskAssignmentPath);
    await page.locator('#vizControls').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(800);

    const edgeId = 'http://example.org/task-assignment#Task->http://example.org/project-mgmt#Person:http://example.org/task-assignment#assignedTo';
    const opened = await page.evaluate((id: string) => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { editEdge?: (edgeId: string) => boolean } }).__EDITOR_TEST__;
      return testHook?.editEdge?.(id) ?? false;
    }, edgeId);
    expect(opened).toBe(true);
    await page.waitForTimeout(300);

    const modalValues = await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { getEditEdgeModalFromToAndRelationship?: () => { fromLabel: string; toLabel: string; relationshipValue: string } | null } }).__EDITOR_TEST__;
      return testHook?.getEditEdgeModalFromToAndRelationship?.() ?? null;
    });
    expect(modalValues).not.toBeNull();
    expect(modalValues!.fromLabel).toMatch(/Task/i);
    expect(modalValues!.toLabel).toMatch(/Person/i);
    expect(modalValues!.relationshipValue).not.toMatch(/^\/\//);
    expect(modalValues!.relationshipValue.length).toBeLessThan(100);
  }, 10000);

  it('Add from referenced ontology finds classes referenced in current file (e.g. Project)', async () => {
    await page.waitForFunction(() => (window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ !== undefined, { timeout: 5000 });
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);

    const taskAssignmentPath = join(FIXTURES_DIR, 'externalRefs-task-assignment.ttl');
    await loadTestFile(page, taskAssignmentPath);
    await page.locator('#vizControls').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(800);

    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { openAddNodeModal?: (x?: number, y?: number) => void } }).__EDITOR_TEST__;
      testHook?.openAddNodeModal?.(100, 100);
    });
    await page.waitForTimeout(300);
    await page.locator('#addNodeModal').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#addNodeExternalTabBtn').click();
    await page.waitForTimeout(200);
    await page.locator('#addNodeExternalInput').fill('Project');
    await page.waitForTimeout(800);

    const resultText = await page.evaluate(() => {
      const resultsDiv = document.getElementById('addNodeExternalResults');
      const descDiv = document.getElementById('addNodeExternalDescription');
      const a = resultsDiv?.style.display !== 'none' ? (resultsDiv?.textContent ?? '') : '';
      const b = descDiv?.style.display !== 'none' ? (descDiv?.textContent ?? '') : '';
      return a + b;
    });
    expect(resultText).toMatch(/Project/i);
    expect(resultText).not.toMatch(/No classes found/);
  }, 10000);

  it('Add from referenced ontology finds Project after Project node was deleted from canvas', async () => {
    await page.waitForFunction(() => (window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ !== undefined, { timeout: 5000 });
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);

    const taskAssignmentPath = join(FIXTURES_DIR, 'externalRefs-task-assignment.ttl');
    await loadTestFile(page, taskAssignmentPath);
    await page.locator('#vizControls').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(800);

    const projectUri = 'http://example.org/project-mgmt#Project';
    const selected = await page.evaluate((id: string) => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { selectNodeById?: (nodeId: string) => boolean } }).__EDITOR_TEST__;
      return testHook?.selectNodeById?.(id) ?? false;
    }, projectUri);
    expect(selected).toBe(true);
    await page.waitForTimeout(200);
    const deleted = await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { performDelete?: () => boolean } }).__EDITOR_TEST__;
      return testHook?.performDelete?.() ?? false;
    });
    expect(deleted).toBe(true);
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { openAddNodeModal?: (x?: number, y?: number) => void } }).__EDITOR_TEST__;
      testHook?.openAddNodeModal?.(100, 100);
    });
    await page.waitForTimeout(300);
    await page.locator('#addNodeModal').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#addNodeExternalTabBtn').click();
    await page.waitForTimeout(200);
    await page.locator('#addNodeExternalInput').fill('Project');
    await page.waitForTimeout(800);

    const resultText = await page.evaluate(() => {
      const resultsDiv = document.getElementById('addNodeExternalResults');
      const descDiv = document.getElementById('addNodeExternalDescription');
      const a = resultsDiv?.style.display !== 'none' ? (resultsDiv?.textContent ?? '') : '';
      const b = descDiv?.style.display !== 'none' ? (descDiv?.textContent ?? '') : '';
      return a + b;
    });
    expect(resultText).toMatch(/Project/i);
    expect(resultText).not.toMatch(/No classes found/);
  }, 10000);

  it('re-added external node (Add from referenced ontology) has external styling (opacity and Imported-from tooltip)', async () => {
    await page.waitForFunction(() => (window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ !== undefined, { timeout: 5000 });
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);

    const taskAssignmentPath = join(FIXTURES_DIR, 'externalRefs-task-assignment.ttl');
    await loadTestFile(page, taskAssignmentPath);
    await page.locator('#vizControls').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(800);

    const projectUri = 'http://example.org/project-mgmt#Project';
    const selected = await page.evaluate((id: string) => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { selectNodeById?: (nodeId: string) => boolean } }).__EDITOR_TEST__;
      return testHook?.selectNodeById?.(id) ?? false;
    }, projectUri);
    expect(selected).toBe(true);
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { performDelete?: () => boolean } }).__EDITOR_TEST__;
      testHook?.performDelete?.();
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { openAddNodeModal?: (x?: number, y?: number) => void } }).__EDITOR_TEST__;
      testHook?.openAddNodeModal?.(100, 100);
    });
    await page.waitForTimeout(300);
    await page.locator('#addNodeModal').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#addNodeExternalTabBtn').click();
    await page.waitForTimeout(200);
    await page.locator('#addNodeExternalInput').fill('Project');
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const resultsDiv = document.getElementById('addNodeExternalResults');
      const items = resultsDiv?.querySelectorAll('.external-class-result');
      if (items?.length) {
        for (const el of items) {
          if ((el as HTMLElement).textContent?.includes('Project')) {
            (el as HTMLElement).click();
            break;
          }
        }
      }
    });
    await page.waitForTimeout(200);
    await page.locator('#addNodeConfirm').click();
    await page.waitForTimeout(500);

    const options = await page.evaluate((id: string) => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { getRenderedNodeOptions?: (nodeId: string) => { opacity?: number; title?: string } | null } }).__EDITOR_TEST__;
      return testHook?.getRenderedNodeOptions?.(id) ?? null;
    }, projectUri);
    expect(options).not.toBeNull();
    expect(options!.opacity).toBe(0.5);
    expect(options!.title).toMatch(/Imported from/i);
  }, 10000);

  it('external nodes show (Imported from ...) tooltip on hover', async () => {
    await page.waitForFunction(() => (window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ !== undefined, { timeout: 5000 });
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);

    const taskAssignmentPath = join(FIXTURES_DIR, 'externalRefs-task-assignment.ttl');
    await loadTestFile(page, taskAssignmentPath);
    await page.locator('#vizControls').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(800);

    const personUri = 'http://example.org/project-mgmt#Person';
    const options = await page.evaluate((id: string) => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { getRenderedNodeOptions?: (nodeId: string) => { title?: string } | null } }).__EDITOR_TEST__;
      return testHook?.getRenderedNodeOptions?.(id) ?? null;
    }, personUri);
    expect(options).not.toBeNull();
    expect(options!.title).toMatch(/Imported from/i);
  }, 10000);

  it('Add from referenced ontology shows yellow warning when class already exists in graph', async () => {
    await page.waitForFunction(() => (window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ !== undefined, { timeout: 5000 });
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);

    const taskAssignmentPath = join(FIXTURES_DIR, 'externalRefs-task-assignment.ttl');
    await loadTestFile(page, taskAssignmentPath);
    await page.locator('#vizControls').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(800);

    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { openAddNodeModal?: (x?: number, y?: number) => void } }).__EDITOR_TEST__;
      testHook?.openAddNodeModal?.(100, 100);
    });
    await page.waitForTimeout(300);
    await page.locator('#addNodeModal').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#addNodeExternalTabBtn').click();
    await page.waitForTimeout(200);
    await page.locator('#addNodeExternalInput').fill('Project');
    await page.waitForTimeout(800);

    const resultText = await page.evaluate(() => {
      const resultsDiv = document.getElementById('addNodeExternalResults');
      const descDiv = document.getElementById('addNodeExternalDescription');
      const a = resultsDiv?.style.display !== 'none' ? (resultsDiv?.textContent ?? '') : '';
      const b = descDiv?.style.display !== 'none' ? (descDiv?.textContent ?? '') : '';
      return a + b;
    });
    expect(resultText).toMatch(/Project/i);
    expect(resultText).toMatch(/already existing in the editor canvas/i);
  }, 10000);

  it('Add Edge modal shows correct From/To when target is re-added external node (Person)', async () => {
    await page.waitForFunction(() => (window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ !== undefined, { timeout: 5000 });
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);

    const taskAssignmentPath = join(FIXTURES_DIR, 'externalRefs-task-assignment.ttl');
    await loadTestFile(page, taskAssignmentPath);
    await page.locator('#vizControls').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(800);

    const personUri = 'http://example.org/project-mgmt#Person';
    const selected = await page.evaluate((id: string) => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { selectNodeById?: (nodeId: string) => boolean } }).__EDITOR_TEST__;
      return testHook?.selectNodeById?.(id) ?? false;
    }, personUri);
    expect(selected).toBe(true);
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { performDelete?: () => boolean } }).__EDITOR_TEST__;
      testHook?.performDelete?.();
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { openAddNodeModal?: (x?: number, y?: number) => void } }).__EDITOR_TEST__;
      testHook?.openAddNodeModal?.(100, 100);
    });
    await page.waitForTimeout(300);
    await page.locator('#addNodeModal').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#addNodeExternalTabBtn').click();
    await page.waitForTimeout(200);
    await page.locator('#addNodeExternalInput').fill('Person');
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const resultsDiv = document.getElementById('addNodeExternalResults');
      const items = resultsDiv?.querySelectorAll('.external-class-result');
      if (items?.length) {
        for (const el of items) {
          if ((el as HTMLElement).textContent?.includes('Person')) {
            (el as HTMLElement).click();
            break;
          }
        }
      }
    });
    await page.waitForTimeout(200);
    await page.locator('#addNodeConfirm').click();
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { showAddEdgeModalForTest?: (from: string, to: string) => void } }).__EDITOR_TEST__;
      testHook?.showAddEdgeModalForTest?.('Task', 'http://example.org/project-mgmt#Person');
    });
    await page.waitForTimeout(300);
    const modalValues = await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { getEditEdgeModalFromToAndRelationship?: () => { fromLabel: string; toLabel: string; relationshipValue: string } | null } }).__EDITOR_TEST__;
      return testHook?.getEditEdgeModalFromToAndRelationship?.() ?? null;
    });
    expect(modalValues).not.toBeNull();
    expect(modalValues!.fromLabel).toMatch(/Task/i);
    expect(modalValues!.toLabel).toMatch(/Person/i);
    await page.evaluate(() => {
      const btn = document.getElementById('editEdgeCancel');
      if (btn) (btn as HTMLButtonElement).click();
    });
    await page.waitForTimeout(200);
  }, 10000);

  it('edge to external node (assigned to) uses color from Object properties menu', async () => {
    await page.waitForFunction(() => (window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ !== undefined, { timeout: 5000 });
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);

    const taskAssignmentPath = join(FIXTURES_DIR, 'externalRefs-task-assignment.ttl');
    await loadTestFile(page, taskAssignmentPath);
    await page.locator('#vizControls').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(800);

    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { setEdgeTypeColor?: (type: string, color: string) => void } }).__EDITOR_TEST__;
      testHook?.setEdgeTypeColor?.('assignedTo', '#800080');
    });
    await page.waitForTimeout(500);

    const edgeId = 'Task->http://example.org/project-mgmt#Person:http://example.org/task-assignment#assignedTo';
    const altEdgeId = 'http://example.org/task-assignment#Task->http://example.org/project-mgmt#Person:http://example.org/task-assignment#assignedTo';
    const options = await page.evaluate((ids: string[]) => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { getRenderedEdgeOptions?: (edgeId: string) => { color?: string } | null } }).__EDITOR_TEST__;
      for (const id of ids) {
        const o = testHook?.getRenderedEdgeOptions?.(id);
        if (o?.color) return o;
      }
      return null;
    }, [edgeId, altEdgeId]);
    expect(options).not.toBeNull();
    expect(options!.color?.toLowerCase()).toBe('#800080');
  }, 10000);

  it('adding one edge does not create extra edges of the same type', async () => {
    await page.waitForFunction(() => (window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ !== undefined, { timeout: 5000 });
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);

    const taskAssignmentPath = join(FIXTURES_DIR, 'externalRefs-task-assignment.ttl');
    await loadTestFile(page, taskAssignmentPath);
    await page.locator('#vizControls').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(800);

    const { edgeCountBefore, rawEdgeCountBefore } = await page.evaluate(() => {
      const testHook = (window as unknown as {
        __EDITOR_TEST__?: { getVisibleEdgeCount?: () => number; getRawDataEdges?: () => { from: string; to: string; type: string }[] };
      }).__EDITOR_TEST__;
      return {
        edgeCountBefore: testHook?.getVisibleEdgeCount?.() ?? 0,
        rawEdgeCountBefore: testHook?.getRawDataEdges?.()?.length ?? 0,
      };
    });

    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { showAddEdgeModalForTest?: (from: string, to: string) => void } }).__EDITOR_TEST__;
      testHook?.showAddEdgeModalForTest?.('Task', 'http://example.org/project-mgmt#Person');
    });
    await page.waitForTimeout(300);
    await page.locator('#editEdgeType').fill('assigned');
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const resultsDiv = document.getElementById('editEdgeTypeResults');
      const items = resultsDiv?.querySelectorAll('.edit-edge-type-result');
      if (items?.length) {
        for (const el of items) {
          if ((el as HTMLElement).textContent?.toLowerCase().includes('assigned to')) {
            (el as HTMLElement).click();
            break;
          }
        }
      }
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      const btn = document.getElementById('editEdgeConfirm') as HTMLButtonElement;
      if (btn) btn.click();
    });
    await page.waitForTimeout(500);

    const { edgeCountAfter, rawEdgeCountAfter, assignedToEdges } = await page.evaluate(() => {
      const testHook = (window as unknown as {
        __EDITOR_TEST__?: { getVisibleEdgeCount?: () => number; getRawDataEdges?: () => { from: string; to: string; type: string }[] };
      }).__EDITOR_TEST__;
      const edges = testHook?.getRawDataEdges?.() ?? [];
      const assignedTo = edges.filter(
        (e) => (e.type === 'assignedTo' || e.type.includes('assignedTo')) && e.from === 'Task' && e.to.includes('Person')
      );
      return {
        edgeCountAfter: testHook?.getVisibleEdgeCount?.() ?? 0,
        rawEdgeCountAfter: edges.length,
        assignedToEdges: assignedTo.length,
      };
    });

    expect(rawEdgeCountAfter).toBe(rawEdgeCountBefore + 1);
    expect(assignedToEdges).toBe(1);
  }, 10000);

  it('Edges legend in status bar shows all relationship types used in the graph', async () => {
    await page.waitForFunction(() => (window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ !== undefined, { timeout: 5000 });
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);

    const taskAssignmentPath = join(FIXTURES_DIR, 'externalRefs-task-assignment.ttl');
    await loadTestFile(page, taskAssignmentPath);
    await page.locator('#vizControls').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(800);

    const legendText = await page.locator('#edgeColorsLegend').textContent();
    expect(legendText).toBeTruthy();
    expect(legendText).toMatch(/assigned to/i);
    expect(legendText).toMatch(/for project/i);
    expect(legendText).toMatch(/employed by/i);
  }, 10000);
});
