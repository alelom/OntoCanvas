/**
 * E2E test: Display external ontology references in the graph (Person, Project, Organisation from project-mgmt
 * when viewing task-assignment). Checks "Display external references" and that node count increases.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { loadTestFile, waitForAppReady } from './testHelpers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = process.env.EDITOR_URL || process.env.EDITOR_E2E_URL || 'http://localhost:5173/';
const FIXTURES_DIR = join(__dirname, '../fixtures');

const PERSON_URI = 'http://example.org/project-mgmt#Person';
const PROJECT_URI = 'http://example.org/project-mgmt#Project';

/** Node count shown in the status bar. */
async function getNodeCount(page: Page): Promise<number> {
  const text = await page.locator('#nodeCount').textContent();
  const n = parseInt(text ?? '0', 10);
  return Number.isFinite(n) ? n : 0;
}

/** Load the task-assignment fixture (which references project-mgmt classes) and wait until the app is ready. */
async function loadTaskAssignment(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });
  await page.evaluate(() => {
    const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
    if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
  });
  await loadTestFile(page, join(FIXTURES_DIR, 'externalRefs-task-assignment.ttl'));
}

/** Text shown by the "Add from referenced ontology" tab (results list plus description), visible parts only. */
async function getExternalSearchText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const resultsDiv = document.getElementById('addNodeExternalResults');
    const descDiv = document.getElementById('addNodeExternalDescription');
    const a = resultsDiv?.style.display !== 'none' ? (resultsDiv?.textContent ?? '') : '';
    const b = descDiv?.style.display !== 'none' ? (descDiv?.textContent ?? '') : '';
    return a + b;
  });
}

/** Open the Add Node modal on its "referenced ontology" tab and type `query`. */
async function searchReferencedOntology(page: Page, query: string): Promise<void> {
  await page.evaluate(() => {
    const testHook = (window as unknown as { __EDITOR_TEST__?: { openAddNodeModal?: (x?: number, y?: number) => void } }).__EDITOR_TEST__;
    testHook?.openAddNodeModal?.(100, 100);
  });
  await page.locator('#addNodeModal').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#addNodeExternalTabBtn').click();
  await page.locator('#addNodeExternalInput').fill(query);
}

/** Select `nodeId` and delete it, then wait until the status bar shows fewer nodes and the view settles. */
async function deleteNode(page: Page, nodeId: string): Promise<void> {
  const countBefore = await getNodeCount(page);
  const selected = await page.evaluate((id: string) => {
    const testHook = (window as unknown as { __EDITOR_TEST__?: { selectNodeById?: (nodeId: string) => boolean } }).__EDITOR_TEST__;
    return testHook?.selectNodeById?.(id) ?? false;
  }, nodeId);
  expect(selected).toBe(true);
  const deleted = await page.evaluate(() => {
    const testHook = (window as unknown as { __EDITOR_TEST__?: { performDelete?: () => boolean } }).__EDITOR_TEST__;
    return testHook?.performDelete?.() ?? false;
  });
  expect(deleted).toBe(true);
  await expect.poll(() => getNodeCount(page), { timeout: 5000 }).toBeLessThan(countBefore);
  await waitForAppReady(page);
}

/** Pick the search result whose text contains `label`, confirm the modal, and wait for the node to be in the graph. */
async function addReferencedClass(page: Page, label: string, nodeId: string): Promise<void> {
  // A single match is auto-selected and shown in the description; several matches are listed for the user to pick.
  const item = page.locator('#addNodeExternalResults .external-class-result', { hasText: label }).first();
  const autoSelected = page.locator('#addNodeExternalDescription', { hasText: label });
  await item.or(autoSelected).first().waitFor({ state: 'visible', timeout: 5000 });
  if (await item.isVisible()) await item.click();
  await page.locator('#addNodeConfirm').click();
  // External nodes are added when the graph is built, so they are not in rawData: wait for the rendered node.
  await page.waitForFunction(
    (id: string) => {
      const hook = (window as unknown as { __EDITOR_TEST__?: { getRenderedNodeOptions?: (nodeId: string) => unknown } }).__EDITOR_TEST__;
      return (hook?.getRenderedNodeOptions?.(id) ?? null) !== null;
    },
    nodeId,
    { timeout: 5000 }
  );
  await waitForAppReady(page);
}

type ModalFromTo = { fromLabel: string; toLabel: string; relationshipValue: string };

/** Wait for the Edit/Add Edge modal to be showing and return its From/To/relationship values. */
async function waitForEdgeModalValues(page: Page): Promise<ModalFromTo> {
  const handle = await page.waitForFunction(
    () => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { getEditEdgeModalFromToAndRelationship?: () => ModalFromTo | null } }).__EDITOR_TEST__;
      return testHook?.getEditEdgeModalFromToAndRelationship?.() ?? null;
    },
    undefined,
    { timeout: 5000 }
  );
  return (await handle.jsonValue()) as ModalFromTo;
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
    await loadTaskAssignment(page);
    await expect.poll(() => getNodeCount(page), { timeout: 5000 }).toBeGreaterThanOrEqual(5);
  }, 10000);

  it('undo restores store and edges after deleting an external node', async () => {
    await loadTaskAssignment(page);
    await expect.poll(() => getNodeCount(page), { timeout: 5000 }).toBeGreaterThanOrEqual(5);
    const countBefore = await getNodeCount(page);

    await deleteNode(page, PERSON_URI);

    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { performUndo?: () => void } }).__EDITOR_TEST__;
      testHook?.performUndo?.();
    });
    await expect.poll(() => getNodeCount(page), { timeout: 5000 }).toBe(countBefore);
  }, 10000);

  it('Edit Edge modal shows correct From/To and relationship for edge to external node', async () => {
    await loadTaskAssignment(page);

    const edgeId = 'http://example.org/task-assignment#Task->http://example.org/project-mgmt#Person:http://example.org/task-assignment#assignedTo';
    const opened = await page.evaluate((id: string) => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { editEdge?: (edgeId: string) => boolean } }).__EDITOR_TEST__;
      return testHook?.editEdge?.(id) ?? false;
    }, edgeId);
    expect(opened).toBe(true);

    const modalValues = await waitForEdgeModalValues(page);
    expect(modalValues.fromLabel).toMatch(/Task/i);
    expect(modalValues.toLabel).toMatch(/Person/i);
    expect(modalValues.relationshipValue).not.toMatch(/^\/\//);
    expect(modalValues.relationshipValue.length).toBeLessThan(100);
  }, 10000);

  it('Add from referenced ontology finds classes referenced in current file (e.g. Project)', async () => {
    await loadTaskAssignment(page);
    await searchReferencedOntology(page, 'Project');

    await expect.poll(() => getExternalSearchText(page), { timeout: 5000 }).toMatch(/Project/i);
    expect(await getExternalSearchText(page)).not.toMatch(/No classes found/);
  }, 10000);

  it('Add from referenced ontology finds Project after Project node was deleted from canvas', async () => {
    await loadTaskAssignment(page);
    await deleteNode(page, PROJECT_URI);
    await searchReferencedOntology(page, 'Project');

    await expect.poll(() => getExternalSearchText(page), { timeout: 5000 }).toMatch(/Project/i);
    expect(await getExternalSearchText(page)).not.toMatch(/No classes found/);
  }, 10000);

  it('re-added external node (Add from referenced ontology) has external styling (opacity and Imported-from tooltip)', async () => {
    await loadTaskAssignment(page);
    await deleteNode(page, PROJECT_URI);
    await searchReferencedOntology(page, 'Project');
    await addReferencedClass(page, 'Project', PROJECT_URI);

    const options = await page.evaluate((id: string) => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { getRenderedNodeOptions?: (nodeId: string) => { opacity?: number; title?: string } | null } }).__EDITOR_TEST__;
      return testHook?.getRenderedNodeOptions?.(id) ?? null;
    }, PROJECT_URI);
    expect(options).not.toBeNull();
    expect(options!.opacity).toBe(0.5);
    expect(options!.title).toMatch(/Imported from/i);
  }, 10000);

  it('external nodes show (Imported from ...) tooltip on hover', async () => {
    await loadTaskAssignment(page);

    const options = await page.evaluate((id: string) => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { getRenderedNodeOptions?: (nodeId: string) => { title?: string } | null } }).__EDITOR_TEST__;
      return testHook?.getRenderedNodeOptions?.(id) ?? null;
    }, PERSON_URI);
    expect(options).not.toBeNull();
    expect(options!.title).toMatch(/Imported from/i);
  }, 10000);

  it('Add from referenced ontology shows yellow warning when class already exists in graph', async () => {
    await loadTaskAssignment(page);
    await searchReferencedOntology(page, 'Project');

    await expect.poll(() => getExternalSearchText(page), { timeout: 5000 }).toMatch(/already existing in the editor canvas/i);
    expect(await getExternalSearchText(page)).toMatch(/Project/i);
  }, 10000);

  it('Add Edge modal shows correct From/To when target is re-added external node (Person)', async () => {
    await loadTaskAssignment(page);
    await deleteNode(page, PERSON_URI);
    await searchReferencedOntology(page, 'Person');
    await addReferencedClass(page, 'Person', PERSON_URI);

    await page.evaluate((to: string) => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { showAddEdgeModalForTest?: (from: string, to: string) => void } }).__EDITOR_TEST__;
      testHook?.showAddEdgeModalForTest?.('Task', to);
    }, PERSON_URI);
    const modalValues = await waitForEdgeModalValues(page);
    expect(modalValues.fromLabel).toMatch(/Task/i);
    expect(modalValues.toLabel).toMatch(/Person/i);
    await page.locator('#editEdgeCancel').click();
  }, 10000);

  it('edge to external node (assigned to) uses color from Object properties menu', async () => {
    await loadTaskAssignment(page);

    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { setEdgeTypeColor?: (type: string, color: string) => void } }).__EDITOR_TEST__;
      testHook?.setEdgeTypeColor?.('assignedTo', '#800080');
    });

    const edgeId = 'Task->http://example.org/project-mgmt#Person:http://example.org/task-assignment#assignedTo';
    const altEdgeId = 'http://example.org/task-assignment#Task->http://example.org/project-mgmt#Person:http://example.org/task-assignment#assignedTo';
    await expect
      .poll(
        () =>
          page.evaluate((ids: string[]) => {
            const testHook = (window as unknown as { __EDITOR_TEST__?: { getRenderedEdgeOptions?: (edgeId: string) => { color?: string } | null } }).__EDITOR_TEST__;
            for (const id of ids) {
              const o = testHook?.getRenderedEdgeOptions?.(id);
              if (o?.color) return o.color.toLowerCase();
            }
            return null;
          }, [edgeId, altEdgeId]),
        { timeout: 5000 }
      )
      .toBe('#800080');
  }, 10000);

  it('adding one edge does not create extra edges of the same type', async () => {
    await loadTaskAssignment(page);

    const getEdgeCounts = () =>
      page.evaluate(() => {
        const testHook = (window as unknown as {
          __EDITOR_TEST__?: { getRawDataEdges?: () => { from: string; to: string; type: string }[] };
        }).__EDITOR_TEST__;
        const edges = testHook?.getRawDataEdges?.() ?? [];
        const assignedTo = edges.filter(
          (e) => (e.type === 'assignedTo' || e.type.includes('assignedTo')) && e.from === 'Task' && e.to.includes('Person')
        );
        return { raw: edges.length, assignedTo: assignedTo.length };
      });
    const rawEdgeCountBefore = (await getEdgeCounts()).raw;

    await page.evaluate((to: string) => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { showAddEdgeModalForTest?: (from: string, to: string) => void } }).__EDITOR_TEST__;
      testHook?.showAddEdgeModalForTest?.('Task', to);
    }, PERSON_URI);
    await page.locator('#editEdgeType').fill('assigned');
    // A single match is auto-selected into the input; several matches are listed for the user to pick.
    const typeItem = page.locator('#editEdgeTypeResults .edit-edge-type-result', { hasText: /assigned to/i }).first();
    await expect
      .poll(
        async () =>
          (await typeItem.isVisible()) || /assigned to/i.test(await page.locator('#editEdgeType').inputValue()),
        { timeout: 5000 }
      )
      .toBe(true);
    if (await typeItem.isVisible()) await typeItem.click();
    await page.locator('#editEdgeConfirm').click();

    await expect.poll(async () => (await getEdgeCounts()).raw, { timeout: 5000 }).toBe(rawEdgeCountBefore + 1);
    await waitForAppReady(page);
    const after = await getEdgeCounts();
    expect(after.raw).toBe(rawEdgeCountBefore + 1);
    expect(after.assignedTo).toBe(1);
  }, 10000);

  it('Edges legend in status bar shows all relationship types used in the graph', async () => {
    await loadTaskAssignment(page);

    const legend = page.locator('#edgeColorsLegend');
    await expect.poll(async () => (await legend.textContent()) ?? '', { timeout: 5000 }).toMatch(/assigned to/i);
    const legendText = await legend.textContent();
    expect(legendText).toMatch(/for project/i);
    expect(legendText).toMatch(/employed by/i);
  }, 10000);
});
