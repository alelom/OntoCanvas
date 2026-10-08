/**
 * E2E tests for the imported-property warning icon in the Edit annotation property modal: hidden for a
 * locally defined annotation property, shown for an imported one.
 *
 * The import decision itself (isUriFromExternalOntology) is unit-tested in
 * tests/unit/annotationPropertyWarning.test.ts; these check the icon the user actually sees.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { loadTestFile } from './testHelpers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const TEST_FIXTURES_DIR = join(__dirname, '../fixtures/imported-ontology');

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage();
  await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });
});

afterEach(async () => {
  if (page && !page.isClosed()) {
    await page.close();
  }
});

/**
 * Open the Edit annotation property modal for `name` the way a user does (the menu's edit button) and report
 * whether its imported-property warning icon is shown. The button is clicked programmatically so the real
 * listener runs whether or not the Annotation Properties panel is open.
 */
async function warningIconShownInEditModal(p: Page, name: string): Promise<boolean> {
  const clicked = await p.evaluate((n) => {
    const btn = document.querySelector(`.annotation-prop-edit-btn[data-name="${n}"]`) as HTMLElement | null;
    btn?.click();
    return !!btn;
  }, name);
  expect(clicked, `edit button for ${name}`).toBe(true);
  await p.locator('#editAnnotationPropertyModal').waitFor({ state: 'visible', timeout: 5000 });
  return p.locator('#editAnnotationPropertyModal .imported-warning-icon').isVisible();
}

describe('Annotation Property Warning E2E', () => {
  it('should not show warning icon for locally defined annotation property', async () => {
    const parentFile = join(TEST_FIXTURES_DIR, 'labellableRoot-parent.ttl');
    expect(existsSync(parentFile)).toBe(true);

    await loadTestFile(page, parentFile);
    // labellableRoot is declared here with rdfs:isDefinedBy <http://example.org/core>, this ontology itself.
    expect(await warningIconShownInEditModal(page, 'labellableRoot')).toBe(false);
  });

  it('should show warning icon for imported annotation property', async () => {
    const childFile = join(TEST_FIXTURES_DIR, 'labellableRoot-child.ttl');
    expect(existsSync(childFile)).toBe(true);

    await loadTestFile(page, childFile);
    // labellableRoot is only used here (core:labellableRoot); the imported core ontology defines it.
    expect(await warningIconShownInEditModal(page, 'labellableRoot')).toBe(true);
  });
});
