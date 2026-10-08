/**
 * Comprehensive E2E tests for imported property prefixes display.
 * Tests that imported object, data, and annotation properties show with their prefixes
 * in dropdown menus and edit modals.
 *
 * The fixtures import `http://example.org/...` ontologies. Requests to anything but the dev server are
 * aborted so every run sees the same thing. Tests wait for outcomes (the app's ready signal, a visible
 * modal, menu text), never for a fixed duration (#93, #97).
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
const CONNECTS_TO = 'http://example.org/object-base#connectsTo';

/** A child ontology with one local data property and one used from the ontology it imports. */
const LOCAL_AND_IMPORTED_DATA_PROPS_TTL = `@prefix : <http://example.org/child#> .
@prefix ext: <http://example.org/parent#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<http://example.org/child> rdf:type owl:Ontology ; owl:imports <http://example.org/parent> .
:localProp rdf:type owl:DatatypeProperty ; rdfs:label "local prop" ; rdfs:domain :Thing1 ; rdfs:range xsd:string .
:Thing1 rdf:type owl:Class ; rdfs:label "Thing 1" ;
  rdfs:subClassOf [ rdf:type owl:Restriction ; owl:onProperty ext:extProp ; owl:onDataRange xsd:string ] .
`;

type MenuId = 'edgeStylesMenu' | 'dataPropsMenu' | 'annotationPropsMenu';
const MENU_CONTENT: Record<MenuId, string> = {
  edgeStylesMenu: 'edgeStylesContent',
  dataPropsMenu: 'dataPropsContent',
  annotationPropsMenu: 'annotationPropsContent',
};

/** Open a sidebar menu (a `<details>`; its content is rendered when it opens) and wait until its text contains `expected`. */
async function openMenu(page: Page, menuId: MenuId, expected: string): Promise<void> {
  const isOpen = await page.locator(`details#${menuId}`).evaluate((el) => (el as HTMLDetailsElement).open);
  if (!isOpen) await page.locator(`details#${menuId} > summary`).click();
  await page
    .waitForFunction(
      ([id, text]) => (document.getElementById(id)?.textContent ?? '').includes(text),
      [MENU_CONTENT[menuId], expected] as const,
      { timeout: 5000 }
    )
    .catch(() => undefined); // Fall through to the assertions, which report the actual content.
}

/** Text of the bold name span of each row in a menu (the property's display name). */
async function getMenuRowNames(page: Page, menuId: MenuId): Promise<string[]> {
  return page.evaluate((id) => {
    const content = document.getElementById(id);
    return Array.from(content?.querySelectorAll('span[style*="font-weight: bold"]') ?? []).map((s) => s.textContent?.trim() ?? '');
  }, MENU_CONTENT[menuId]);
}

/** Text of an element, or '' when it does not exist. */
async function textOf(page: Page, selector: string): Promise<string> {
  return page.evaluate((sel) => document.querySelector(sel)?.textContent ?? '', selector);
}

/**
 * Open the Add Edge modal between the first two classes and type `query` into its relationship search.
 * The query must match more than one relationship type: a single match is auto-selected and shows no list.
 */
async function searchEdgeType(page: Page, query: string): Promise<void> {
  await page.evaluate(() => {
    const testHook = (window as any).__EDITOR_TEST__;
    const nodes = testHook.getRawData().nodes;
    testHook.showAddEdgeModalForTest(nodes[0].id, nodes[1].id);
  });
  await page.waitForSelector('#editEdgeModal', { state: 'visible', timeout: 5000 });
  await page.locator('#editEdgeType').fill(query);
  // The search is debounced; wait for its results rather than for the debounce.
  await page.waitForSelector('#editEdgeTypeResults .edit-edge-type-result', { state: 'visible', timeout: 5000 });
}

describe('Imported Property Prefixes E2E', () => {
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
    await page.evaluate(() => {
      const testHook = (window as any).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  describe('Object Properties Prefixes', () => {
    it('should display imported object property with prefix in Object Properties dropdown', async () => {
      const childFile = join(TEST_FIXTURES_DIR, 'object-props-child.ttl');
      expect(existsSync(childFile)).toBe(true);
      await loadTestFile(page, childFile);

      await openMenu(page, 'edgeStylesMenu', 'connects');
      const names = await getMenuRowNames(page, 'edgeStylesMenu');
      const displayText = names.find((n) => n.includes('connects')) ?? '';
      expect(displayText).toMatch(/^base:connects/i); // prefix:label format
      expect(displayText).not.toBe('connectsTo');
      expect(displayText).not.toBe('connects to');
    });

    it('should display imported object property with prefix when editing the property', async () => {
      const childFile = join(TEST_FIXTURES_DIR, 'object-props-child.ttl');
      await loadTestFile(page, childFile);

      await openMenu(page, 'edgeStylesMenu', 'connects');
      await page.locator(`#edgeStylesContent .edge-edit-btn[data-type="${CONNECTS_TO}"]`).click();
      await page.waitForSelector('#editRelationshipTypeModal', { state: 'visible', timeout: 5000 });

      const identifierText = await textOf(page, '#editRelTypeIdentifier');
      const nameText = await textOf(page, '#editRelTypeName');
      expect(identifierText.includes('base:') || nameText.includes('base:')).toBe(true);
    });

    it('should display imported object property with prefix in Edit Edge modal search', async () => {
      const childFile = join(TEST_FIXTURES_DIR, 'object-props-child.ttl');
      await loadTestFile(page, childFile);

      await searchEdgeType(page, 'c');
      const items = await page.evaluate(() =>
        Array.from(document.querySelectorAll('#editEdgeTypeResults .edit-edge-type-result')).map((el) => el.textContent ?? '')
      );
      expect(items.length).toBeGreaterThan(0);
      expect(items.some((t) => t.includes('base:connects'))).toBe(true);
    });

    it('should display imported object property with prefix when selected in Edit Edge modal', async () => {
      const childFile = join(TEST_FIXTURES_DIR, 'object-props-child.ttl');
      await loadTestFile(page, childFile);

      await searchEdgeType(page, 'c');
      await page.locator('#editEdgeTypeResults .edit-edge-type-result', { hasText: 'base:connects' }).first().click();
      await page.waitForSelector('#editEdgeTypeResults', { state: 'hidden', timeout: 5000 });

      const inputValue = await page.locator('#editEdgeType').inputValue();
      expect(inputValue).toMatch(/base:connects/i);
      expect(inputValue).not.toBe('connectsTo');
      expect(inputValue).not.toBe('connects to');
    });

    // Also covers an edge whose type is a full URI (the former "...when edge type is full URI" test): the
    // connectsTo edge's type is http://example.org/object-base#connectsTo.
    it('should display imported object property with prefix when editing an existing edge', async () => {
      const childFile = join(TEST_FIXTURES_DIR, 'object-props-child.ttl');
      await loadTestFile(page, childFile);

      const edgeId = await page.evaluate(() => {
        const testHook = (window as any).__EDITOR_TEST__;
        const edge = testHook.getAllEdges().find((e: { type: string }) => e.type === 'http://example.org/object-base#connectsTo');
        return edge ? `${edge.from}->${edge.to}:${edge.type}` : null;
      });
      expect(edgeId).toBe(`ChildClassA->ChildClassB:${CONNECTS_TO}`);

      await page.evaluate((id) => (window as any).__EDITOR_TEST__.openEditModalForEdge(id), edgeId);
      await page.waitForSelector('#editEdgeModal', { state: 'visible', timeout: 5000 });

      const inputValue = await page.locator('#editEdgeType').inputValue();
      expect(inputValue).toMatch(/base:connects/i);
      expect(inputValue).not.toBe('connectsTo');
      expect(inputValue).not.toBe('connects to');
    });
  });

  describe('External Classes in subClassOf Relationships', () => {
    it('should display external class with opacity when referenced in subClassOf', async () => {
      const childChildFile = join(TEST_FIXTURES_DIR, 'object-props-child-child.ttl');
      await loadTestFile(page, childChildFile);

      // vis-network draws on a canvas, so read the rendered node's options rather than DOM styles.
      const nodeInfo = await page.evaluate(() => {
        const network = (window as any).__EDITOR_TEST__.getNetwork();
        const node = network.body.data.nodes.get('http://example.org/object-extended#ChildClass');
        return node ? { label: node.label as string, opacity: node.opacity as number, title: node.title as string } : null;
      });
      expect(nodeInfo).not.toBeNull();
      expect(nodeInfo?.label.replace(/\s+/g, '')).toBe('extended:ChildClass');
      expect(nodeInfo?.title).toContain('Imported from http://example.org/object-extended');
      // Opacity should be 0.5 (50%) for external nodes
      expect(nodeInfo?.opacity).toBeCloseTo(0.5, 1);
    });
  });

  describe('Data Properties Prefixes', () => {
    it('should display imported data property with prefix in Data Properties dropdown', async () => {
      const childFile = join(TEST_FIXTURES_DIR, 'data-props-child.ttl');
      expect(existsSync(childFile)).toBe(true);
      await loadTestFile(page, childFile);

      await openMenu(page, 'dataPropsMenu', 'createdDate');
      const names = await getMenuRowNames(page, 'dataPropsMenu');
      // data-props-child.ttl binds the imported namespace to the prefix "dpbase".
      expect(names).toContain('dpbase:createdDate');
    });

    // data-props-child.ttl has no local data property (identifier is dpbase:identifier, imported), so this uses a
    // child with one local and one imported data property. Also covers the former "should show prefix for imported
    // properties but not for local properties" test.
    it('should NOT display local data property with prefix in Data Properties dropdown', async () => {
      await openEditorWithTtl(page, LOCAL_AND_IMPORTED_DATA_PROPS_TTL);

      await openMenu(page, 'dataPropsMenu', 'local prop');
      const names = await getMenuRowNames(page, 'dataPropsMenu');
      expect(names).toContain('local prop'); // Local: label, no prefix
      expect(names).toContain('ext:extProp'); // Imported: prefix
    });

    // The identifier is prefix:name, as in the Edit Object Property modal, not the full IRI (#101).
    it('should display imported data property with prefix in Edit Data Property modal', async () => {
      const childFile = join(TEST_FIXTURES_DIR, 'data-props-child.ttl');
      await loadTestFile(page, childFile);

      await openMenu(page, 'dataPropsMenu', 'createdDate');
      await page.locator('#dataPropsContent .data-prop-edit-btn[data-name="createdDate"]').click();
      await page.waitForSelector('#editDataPropertyModal', { state: 'visible', timeout: 5000 });

      expect((await textOf(page, '#editDataPropIdentifier')).trim()).toBe('dpbase:createdDate');
    });

    it('should NOT display local data property with prefix in Edit Data Property modal', async () => {
      await openEditorWithTtl(page, LOCAL_AND_IMPORTED_DATA_PROPS_TTL);

      await openMenu(page, 'dataPropsMenu', 'local prop');
      await page.locator('#dataPropsContent .data-prop-edit-btn[data-name="localProp"]').click();
      await page.waitForSelector('#editDataPropertyModal', { state: 'visible', timeout: 5000 });

      const nameText = await textOf(page, '#editDataPropName');
      const identifierText = await textOf(page, '#editDataPropIdentifier');
      expect(nameText.includes('ext:') || identifierText.includes('ext:')).toBe(false);
    });
  });

  describe('Annotation Properties Prefixes', () => {
    it('should display imported annotation property with prefix in Annotation Properties dropdown', async () => {
      const childFile = join(TEST_FIXTURES_DIR, 'labellableRoot-child.ttl');
      expect(existsSync(childFile)).toBe(true);
      await loadTestFile(page, childFile);

      await openMenu(page, 'annotationPropsMenu', 'labellableRoot');
      const text = await textOf(page, '#annotationPropsContent');
      // labellableRoot-child.ttl binds the imported namespace to the prefix "core".
      expect(text).toContain('core:labellableRoot');
    });

    it('should display imported annotation property with prefix in Edit Annotation Property modal', async () => {
      const childFile = join(TEST_FIXTURES_DIR, 'labellableRoot-child.ttl');
      await loadTestFile(page, childFile);

      await openMenu(page, 'annotationPropsMenu', 'labellableRoot');
      await page.locator('#annotationPropsContent .annotation-prop-edit-btn[data-name="labellableRoot"]').click();
      await page.waitForSelector('#editAnnotationPropertyModal', { state: 'visible', timeout: 5000 });

      const nameText = await textOf(page, '#editAnnotationPropName');
      expect(nameText).toContain('core:');
    });
  });

  describe('Prefix Display Consistency', () => {
    // comprehensive-child.ttl uses an imported object, data and annotation property, all from the "base" prefix.
    it('should consistently show prefix format (prefix:label) across all property types', async () => {
      const childFile = join(TEST_FIXTURES_DIR, 'comprehensive-child.ttl');
      await loadTestFile(page, childFile);

      await openMenu(page, 'edgeStylesMenu', 'importedObjectProp');
      expect(await getMenuRowNames(page, 'edgeStylesMenu')).toContain('base:importedObjectProp');

      await openMenu(page, 'dataPropsMenu', 'importedDataProp');
      expect(await getMenuRowNames(page, 'dataPropsMenu')).toContain('base:importedDataProp');

      await openMenu(page, 'annotationPropsMenu', 'labellableRoot');
      expect(await textOf(page, '#annotationPropsContent')).toContain('base:labellableRoot');
    });
  });
});
