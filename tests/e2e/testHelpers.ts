/**
 * Shared test helpers for E2E tests.
 * These functions provide consistent, reliable ways to wait for application state
 * and interact with the application without complex DOM manipulations.
 */
import type { Page } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Wait until the app is ready for a test to act on (#93): an ontology is loaded, no loading or "Open
 * ontology" dialog covers the page, the toolbar is shown and the graph view has settled after its last
 * render. Use this after any load or re-render instead of a fixed sleep.
 */
export async function waitForAppReady(page: Page, timeout = 5000): Promise<void> {
  await page.waitForFunction(() => (window as any).__EDITOR_TEST__?.isAppReady?.() === true, undefined, { timeout });
}

/**
 * Open the editor in `page` and load `ttl` straight into it, then wait until it is ready. Replaces the
 * goto + loadTtlDirectly + "close the Open ontology dialog" + Escape steps tests used to repeat.
 */
export async function openEditorWithTtl(page: Page, ttl: string, url = 'http://localhost:5173/'): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await page.waitForFunction(() => (window as any).__EDITOR_TEST__?.loadTtlDirectly !== undefined, undefined, { timeout: 5000 });
  await page.evaluate((t) => (window as any).__EDITOR_TEST__.loadTtlDirectly(t), ttl);
  await waitForAppReady(page);
}

/**
 * Wait for the graph to be fully rendered and ready.
 * Uses consistent checks across all tests to avoid flakiness.
 */
export async function waitForGraphRender(page: Page, timeout = 5000): Promise<void> {
  // Wait for vizControls to be visible (indicates graph is initialized)
  await page.waitForFunction(
    () => {
      const vizControls = document.getElementById('vizControls');
      return vizControls && (vizControls as HTMLElement).style.display !== 'none';
    }, undefined,
    { timeout }
  );

  // Wait for test hook to be available and data to be populated
  await page.waitForFunction(
    () => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (!testHook?.getRawData) return false;
      const rawData = testHook.getRawData();
      const ttlStore = testHook.getTtlStore?.();
      const network = testHook.getNetwork?.();
      return (rawData.nodes.length > 0 || rawData.edges.length > 0) && ttlStore !== null && network !== null;
    }, undefined,
    { timeout }
  );

  // Wait for status bar counts to be populated (indicates graph is rendered)
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
    }, undefined,
    { timeout }
  );

  await waitForAppReady(page, timeout);
}

/**
 * Fail every request that isn't to the local dev server. Fixtures with owl:imports make the app fetch their
 * imported ontologies (e.g. http://example.org/...); blocking them keeps tests offline and deterministic.
 * Call before the page loads anything.
 */
export async function blockExternalRequests(page: Page): Promise<void> {
  await page.route((url) => url.hostname !== 'localhost', (route) => route.abort());
}

/**
 * Choose a file in the file input without waiting for it to load: for tests whose load is expected to fail
 * (a corrupt ontology) and that wait for the error themselves.
 */
export async function chooseFile(page: Page, filePath: string): Promise<void> {
  await page.locator('input#fileInput').setInputFiles(filePath, { timeout: 5000 });
}

/**
 * Load a test file through the file input, the way a user opens one, and wait until the app is ready.
 * Each load creates a new store, so waiting for a store other than the one before guarantees this load
 * finished, even when the page already had an ontology (#93).
 */
export async function loadTestFile(page: Page, filePath: string): Promise<void> {
  await page.evaluate(() => {
    (window as any).__e2ePreviousStore = (window as any).__EDITOR_TEST__?.getTtlStore?.() ?? null;
  });
  // setInputFiles works on the hidden input and fires its change event.
  await page.locator('input#fileInput').setInputFiles(filePath, { timeout: 5000 });
  await page.waitForFunction(
    () => {
      const hook = (window as any).__EDITOR_TEST__;
      const store = hook?.getTtlStore?.();
      return !!store && store !== (window as any).__e2ePreviousStore;
    },
    undefined,
    { timeout: 5000 }
  );
  await waitForAppReady(page);
}

/**
 * Get the save button state via test hook (avoids DOM inspection).
 */
export async function getSaveButtonState(page: Page): Promise<{ visible: boolean; hasUnsavedChanges: boolean; ttlStoreExists: boolean }> {
  return await page.evaluate(() => {
    const testHook = (window as any).__EDITOR_TEST__;
    if (testHook?.getSaveButtonState) {
      return testHook.getSaveButtonState();
    }
    // Fallback to DOM inspection if test hook not available
    const saveGroup = document.getElementById('saveGroup');
    const isVisible = saveGroup ? window.getComputedStyle(saveGroup).display !== 'none' : false;
    return {
      visible: isVisible,
      hasUnsavedChanges: false,
      ttlStoreExists: false,
    };
  });
}

/**
 * Serve the ontologies in `directory` under their own IRIs, so that the `owl:imports` of a test file can be
 * fetched (#104): a request for `http://example.org/base` gets the file whose ontology IRI that is, with CORS
 * allowed; any other example.org request is aborted. Call it after blockExternalRequests (the later route
 * wins) and before loading the file.
 */
export async function serveOntologies(page: Page, directory: string): Promise<void> {
  const served = new Map<string, string>();
  for (const name of readdirSync(directory).filter((n) => n.endsWith('.ttl'))) {
    const content = readFileSync(join(directory, name), 'utf-8');
    const iri = /<([^>]+)>\s+(?:rdf:type|a)\s+owl:Ontology/.exec(content)?.[1];
    if (iri) served.set(iri, content);
  }
  await page.route(
    (url) => url.hostname === 'example.org',
    (route) => {
      const body = served.get(route.request().url().replace(/#$/, ''));
      return body === undefined
        ? route.abort()
        : route.fulfill({ status: 200, contentType: 'text/turtle', headers: { 'access-control-allow-origin': '*' }, body });
    }
  );
}

/** Wait until the declarations of the loaded ontology's imports have been read, or given up on (#104). */
export async function waitForImportsSettled(page: Page, timeout = 5000): Promise<void> {
  await page.waitForFunction(() => (window as any).__EDITOR_TEST__?.areImportsSettled?.() === true, undefined, { timeout });
}

/**
 * A vis-network label as the user reads it. An imported term's label has a small note above its name, drawn
 * with HTML multi-font markup (#111): "<code>(defined by: </code><i>base</i><code>)</code>\nName". This strips
 * the markup, leaving "(defined by: base)\nName".
 */
export function plainLabel(label: string): string {
  return label
    .replace(/<\/?(?:code|i)>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
