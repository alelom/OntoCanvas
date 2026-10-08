/**
 * Comprehensive E2E tests for imported data properties functionality.
 * Tests warning icons, editable state, transparency, and proper display.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { loadTestFile, openEditorWithTtl, blockExternalRequests } from './testHelpers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const TEST_FIXTURES_DIR = join(__dirname, '../fixtures/imported-ontology');
const PARENT_FILE = join(TEST_FIXTURES_DIR, 'data-props-parent.ttl');
const CHILD_FILE = join(TEST_FIXTURES_DIR, 'data-props-child.ttl');

/** Open the Data Properties menu and click the edit button of `name`, the way a user does, then wait for the modal. */
async function openDataPropertyEditor(page: Page, name: string): Promise<void> {
  await page.locator('#dataPropsMenu summary').click();
  await page.locator(`#dataPropsContent .data-prop-edit-btn[data-name="${name}"]`).click();
  await page.waitForFunction(
    () => getComputedStyle(document.getElementById('editDataPropertyModal')!).display !== 'none',
    undefined,
    { timeout: 5000 }
  );
}

/** Warning icon and field state of the edit data property modal. */
function dataPropModalState(page: Page) {
  return page.evaluate(() => {
    const modal = document.getElementById('editDataPropertyModal')!;
    const warningIcon = modal.querySelector('.modal-content .imported-warning-icon') as HTMLElement | null;
    const label = document.getElementById('editDataPropLabel') as HTMLInputElement;
    const comment = document.getElementById('editDataPropComment') as HTMLTextAreaElement;
    const range = document.getElementById('editDataPropRange') as HTMLSelectElement;
    return {
      warningShown: warningIcon !== null && getComputedStyle(warningIcon).display !== 'none',
      warningText: warningIcon?.textContent?.trim() ?? '',
      labelDisabled: label.disabled,
      commentDisabled: comment.disabled,
      rangeDisabled: range.disabled,
      labelOpacity: label.style.opacity,
      commentOpacity: comment.style.opacity,
    };
  });
}

describe('Imported Data Properties E2E', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(5000);
    await blockExternalRequests(page);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  describe('Warning Icons and Editable State', () => {
    it('should show warning icon for imported data property (createdDate) in edit modal', async () => {
      // createdDate is imported in the child, which uses it from data-base. (In the parent it is local:
      // its rdfs:isDefinedBy is the parent ontology itself.)
      expect(existsSync(CHILD_FILE)).toBe(true);
      await loadTestFile(page, CHILD_FILE);
      await openDataPropertyEditor(page, 'createdDate');

      const state = await dataPropModalState(page);
      expect(state.warningShown).toBe(true);
      expect(state.warningText).toBe('⚠️');
      expect(state.labelDisabled).toBe(true);
      expect(state.commentDisabled).toBe(true);
      expect(state.rangeDisabled).toBe(true);
    });

    it('should NOT show warning icon for internally defined data property (identifier) in edit modal', async () => {
      expect(existsSync(PARENT_FILE)).toBe(true);
      await loadTestFile(page, PARENT_FILE);
      await openDataPropertyEditor(page, 'identifier');

      const state = await dataPropModalState(page);
      expect(state.warningShown).toBe(false);
      expect(state.labelDisabled).toBe(false);
      expect(state.commentDisabled).toBe(false);
      expect(state.rangeDisabled).toBe(false);
    });

    it('should enable fields when isDefinedBy is cleared for imported data property', async () => {
      // localDp's IRI is in the main namespace, so only its rdfs:isDefinedBy makes it imported.
      await openEditorWithTtl(page, `@prefix : <http://example.org/local#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<http://example.org/local> rdf:type owl:Ontology .
:A rdf:type owl:Class .
:localDp rdf:type owl:DatatypeProperty ; rdfs:label "local dp" ; rdfs:domain :A ; rdfs:range xsd:string ;
    rdfs:isDefinedBy <http://example.org/other> .
`);
      await openDataPropertyEditor(page, 'localDp');

      const before = await dataPropModalState(page);
      expect(before.warningShown).toBe(true);
      expect(before.labelDisabled).toBe(true);

      await page.locator('#editDataPropDefinedBy').fill('');

      await expect.poll(() => dataPropModalState(page), { timeout: 5000 }).toMatchObject({
        warningShown: false,
        labelDisabled: false,
        commentDisabled: false,
        rangeDisabled: false,
      });
      const after = await dataPropModalState(page);
      expect(after.labelOpacity).not.toBe('0.5');
      expect(after.commentOpacity).not.toBe('0.5');
    });
  });

  describe('Data Property Display and Transparency', () => {
    // "should display both identifier and createdDate data properties in child ontology" was removed: the
    // child uses dpbase:identifier only in an unqualified owl:minCardinality restriction with no range,
    // which by design draws nothing (pinned by tests/unit/restrictionKinds.test.ts, "an unqualified
    // cardinality with no range has nowhere to point, so draws nothing").

    it('should display data property nodes from imported ontologies with transparency', async () => {
      expect(existsSync(CHILD_FILE)).toBe(true);
      await loadTestFile(page, CHILD_FILE);

      const createdDateNode = await page.evaluate(() => {
        const network = (window as any).__EDITOR_TEST__.getNetwork();
        const node = network.body.data.nodes.get().find((n: any) => String(n.id).includes('createdDate'));
        return node ? { id: String(node.id), opacity: node.opacity ?? null } : null;
      });

      expect(createdDateNode).not.toBeNull();
      expect(createdDateNode!.id).toMatch(/^__dataprop/);
      expect(createdDateNode!.opacity).not.toBeNull();
      expect(createdDateNode!.opacity!).toBeLessThanOrEqual(0.5);
    });
  });

  // "should show warning icon for imported object property in edit modal" was removed: it duplicated
  // "should show warning icon and disable all fields when object property has isDefinedBy set" in
  // tests/e2e/importedObjectPropertyEditModal.e2e.test.ts (same fixture, same assertions).
});
