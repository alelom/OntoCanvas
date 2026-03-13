/**
 * Shared test helpers for E2E tests.
 * These functions provide consistent, reliable ways to wait for application state
 * and interact with the application without complex DOM manipulations.
 */
import type { Page } from 'playwright';

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
    },
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
    },
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
    },
    { timeout }
  );

  await page.waitForTimeout(200);
}

/**
 * Load a test file using the file input.
 * This is the standard way to load files in E2E tests.
 */
export async function loadTestFile(page: Page, filePath: string): Promise<void> {
  // Make file input visible for setInputFiles
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

  // Use setInputFiles to load the file (this properly triggers the change event)
  const fileInput = page.locator('input#fileInput');
  await fileInput.setInputFiles(filePath, { timeout: 5000 });

  // Wait for loading modal to appear (indicates file loading started)
  await page.waitForSelector('#loadingModal', { state: 'visible', timeout: 3000 }).catch(() => {
    // Loading modal might not appear if loading is very fast
  });

  // Wait for loading modal to disappear (indicates file loading completed)
  // Reduced from 10000ms to 5000ms since we've optimized loading
  await page.waitForFunction(
    () => {
      const loadingModal = document.getElementById('loadingModal');
      return !loadingModal || (loadingModal as HTMLElement).style.display === 'none';
    },
    { timeout: 5000 }
  );

  // Wait for ttlStore to be populated (set early in loadTtlAndRender, so this should be fast)
  // Reduced from 10000ms to 5000ms since ttlStore is set immediately after parsing
  await page.waitForFunction(
    () => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (!testHook?.getTtlStore) return false;
      const ttlStore = testHook.getTtlStore();
      return ttlStore !== null;
    },
    { timeout: 5000 }
  );
  
  // Wait for rawData to be populated (after ttlStore is set)
  await page.waitForFunction(
    () => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (!testHook?.getRawData) return false;
      const rawData = testHook.getRawData();
      return (rawData.nodes.length > 0 || rawData.edges.length > 0);
    },
    { timeout: 5000 }
  );

  await page.waitForTimeout(500);
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
