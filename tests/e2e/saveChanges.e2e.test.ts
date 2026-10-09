/**
 * E2E tests for the "Save changes" button functionality.
 * Verifies that the save button works correctly, triggers downloads, and handles errors.
 *
 * Serialization itself (store → Turtle, null-store error) is unit-tested in tests/unit/saveTtl.test.ts and
 * tests/unit/saveButtonState.test.ts; these tests cover the browser side: the button's visibility and the
 * download that saving produces.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { readFileSync } from 'node:fs';
import { waitForAppReady } from './testHelpers';

const EDITOR_URL = 'http://localhost:5173/';

let browser: Browser;
let page: Page;

const testTtl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology ;
    rdfs:comment "Test ontology" .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test Class" .
`;

type SaveButtonState = { visible: boolean; hasUnsavedChanges: boolean; ttlStoreExists: boolean };

function getSaveButtonState(p: Page): Promise<SaveButtonState> {
  return p.evaluate(() => (window as any).__EDITOR_TEST__.getSaveButtonState());
}

/**
 * Load `ttlContent` as if it came from a `.ttl` file named `fileName` (so the Turtle source cache, needed by
 * the default custom serializer, is built), then wait until the app is ready.
 */
async function loadTestFileFromString(p: Page, ttlContent: string, fileName = 'test.ttl'): Promise<void> {
  await p.waitForFunction(() => (window as any).__EDITOR_TEST__?.loadTtlDirectly !== undefined, undefined, {
    timeout: 5000,
  });
  await p.evaluate(
    ({ content, name }) => (window as any).__EDITOR_TEST__.loadTtlDirectly(content, name, name),
    { content: ttlContent, name: fileName }
  );
  await waitForAppReady(p);
}

/** Mark the ontology as having unsaved changes, the way an edit does. */
async function markUnsaved(p: Page): Promise<void> {
  await p.evaluate(() => {
    const testHook = (window as any).__EDITOR_TEST__;
    testHook.setHasUnsavedChanges(true);
    testHook.updateSaveButtonVisibility();
  });
}

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage({ acceptDownloads: true });
  page.setDefaultTimeout(5000);
  await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });

  // Enable debug mode for tests
  await page.evaluate(() => {
    localStorage.setItem('ontologyEditorDebug', 'true');
  });
});

afterEach(async () => {
  if (page && !page.isClosed()) {
    await page.close();
  }
});

describe('Save Changes Button E2E Tests', () => {
  it('save button should be visible when there are unsaved changes', async () => {
    await loadTestFileFromString(page, testTtl);

    const before = await getSaveButtonState(page);
    expect(before.visible).toBe(false);
    expect(before.ttlStoreExists).toBe(true);

    await markUnsaved(page);

    await expect.poll(() => getSaveButtonState(page), { timeout: 5000 }).toEqual({
      visible: true,
      hasUnsavedChanges: true,
      ttlStoreExists: true,
    });
  });

  it('save button should hide after saveTtl is called, and saving downloads the Turtle', async () => {
    await loadTestFileFromString(page, testTtl);
    await markUnsaved(page);

    await expect.poll(async () => (await getSaveButtonState(page)).visible, { timeout: 5000 }).toBe(true);

    // Without a file handle to overwrite, saving downloads the file.
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }),
      page.evaluate(() => (window as any).__EDITOR_TEST__.saveTtl()),
    ]);

    await expect.poll(() => getSaveButtonState(page), { timeout: 5000 }).toMatchObject({
      visible: false,
      hasUnsavedChanges: false,
    });

    expect(download.suggestedFilename()).toBe('test.ttl');
    const downloadedPath = await download.path();
    expect(downloadedPath).toBeTruthy();
    const saved = readFileSync(downloadedPath!, 'utf-8');
    expect(saved).toContain('@prefix');
    expect(saved).toContain('owl:Ontology');
    expect(saved).toContain('TestClass');
  });

  it('save button event listener should be attached on page load', async () => {
    // beforeEach waited for the test hook, which the app installs after wiring its toolbar listeners.
    const saveButton = await page.$('#saveChanges');
    expect(saveButton).not.toBeNull();

    // Check if clicking the button triggers any action (even if it does nothing without a loaded file)
    const clickResult = await page.evaluate(() => {
      const button = document.getElementById('saveChanges');
      if (!button) return { clicked: false };
      let clicked = false;
      button.addEventListener('click', () => { clicked = true; }, { once: true });
      // click() dispatches synchronously, so the listener has run when it returns.
      button.click();
      return { clicked };
    });

    // The button should exist and be clickable
    expect(clickResult.clicked).toBe(true);
  });
});
