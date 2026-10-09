/**
 * E2E tests for imported ontology properties and classes.
 * Tests annotation properties, data properties, object properties, and classes
 * imported from parent ontologies, including edge cases like grandchild ontologies.
 *
 * The fixtures import `http://example.org/...` ontologies. Requests to anything but the dev server are
 * aborted so every run sees the same thing: the app only knows what the loaded file itself says about the
 * imported terms. The tests of section G, and the ones that need a declaration only an import makes, serve the
 * imports from the fixtures (serveOntologies), as a fetchable import would be (#104).
 *
 * Each test opens a fresh page and waits for outcomes (the app's ready signal, a visible modal, menu
 * text), never for a fixed duration (#93, #97).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { loadTestFile, openEditorWithTtl, serveOntologies, waitForImportsSettled } from './testHelpers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const TEST_FIXTURES_DIR = join(__dirname, '../fixtures/imported-ontology');

type MenuId = 'edgeStylesMenu' | 'dataPropsMenu' | 'annotationPropsMenu';
const MENU_CONTENT: Record<MenuId, string> = {
  edgeStylesMenu: 'edgeStylesContent',
  dataPropsMenu: 'dataPropsContent',
  annotationPropsMenu: 'annotationPropsContent',
};

/** Open a sidebar menu (a `<details>`) and return its text now. For a test that has already waited for what it needs
 * (the load, the imports) and wants to look, not wait. */
async function readMenuText(page: Page, menuId: MenuId): Promise<string> {
  const isOpen = await page.locator(`details#${menuId}`).evaluate((el) => (el as HTMLDetailsElement).open);
  if (!isOpen) await page.locator(`details#${menuId} > summary`).click();
  return page.evaluate((id) => document.getElementById(id)?.textContent ?? '', MENU_CONTENT[menuId]);
}

/** Open a sidebar menu and return its text once it contains `expected`. Fails at once, showing the text, when it
 * never does: an expectation that is never met is a test bug, and waiting out the timeout to say so only
 * made every run 5 s slower (#116). */
async function openMenuAndReadText(page: Page, menuId: MenuId, expected: string): Promise<string> {
  const isOpen = await page.locator(`details#${menuId}`).evaluate((el) => (el as HTMLDetailsElement).open);
  if (!isOpen) await page.locator(`details#${menuId} > summary`).click();
  const contentId = MENU_CONTENT[menuId];
  try {
    await page.waitForFunction(
      ([id, text]) => (document.getElementById(id)?.textContent ?? '').includes(text),
      [contentId, expected] as const,
      { timeout: 5000 }
    );
  } catch {
    const actual = await page.evaluate((id) => document.getElementById(id)?.textContent ?? '', contentId);
    throw new Error(`The ${menuId} never showed "${expected}". It shows: ${actual.replace(/\s+/g, ' ').trim()}`);
  }
  return page.evaluate((id) => document.getElementById(id)?.textContent ?? '', contentId);
}

/** Rendered (vis-network) node by id, or null when the node is not drawn. */
async function getRenderedNode(page: Page, nodeId: string): Promise<{ opacity?: number; title?: string; labellableRoot?: boolean | null; background?: string } | null> {
  return page.evaluate((id) => {
    const network = (window as any).__EDITOR_TEST__.getNetwork();
    const node = network?.body?.data?.nodes?.get(id);
    if (!node) return null;
    return { opacity: node.opacity, title: node.title, labellableRoot: node.labellableRoot, background: node.color?.background };
  }, nodeId);
}

/** Ids of the edges vis-network draws. */
async function getRenderedEdgeIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const network = (window as any).__EDITOR_TEST__.getNetwork();
    return (network?.body?.data?.edges?.get() ?? []).map((e: { id: string }) => String(e.id));
  });
}

describe('Imported Ontology Properties E2E', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await launchBrowser();
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(5000);
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

  describe('A) Annotation Properties from Imported Ontologies', () => {
    it('should display labellableRoot annotation property from parent ontology in annotation properties menu with prefix', async () => {
      const childFile = join(TEST_FIXTURES_DIR, 'labellableRoot-child.ttl');
      expect(existsSync(childFile)).toBe(true);
      await loadTestFile(page, childFile);

      const annotPropsContent = await openMenuAndReadText(page, 'annotationPropsMenu', 'labellableRoot');
      expect(annotPropsContent).toContain('core:labellableRoot');
    });

    it('should apply labellableRoot styling correctly when annotation property is from imported ontology', async () => {
      const childFile = join(TEST_FIXTURES_DIR, 'labellableRoot-child.ttl');
      await loadTestFile(page, childFile);

      const labellable = await getRenderedNode(page, 'LabellableClass');
      const nonLabellable = await getRenderedNode(page, 'NonLabellableClass');
      expect(labellable?.labellableRoot).toBe(true);
      expect(nonLabellable?.labellableRoot).toBe(false);
      // The imported boolean annotation drives the fill: true and false are styled differently.
      expect(labellable?.background).toBeTruthy();
      expect(labellable?.background).not.toBe(nonLabellable?.background);
    });

    it('should work correctly for grandchild ontology importing child which imports parent', async () => {
      const grandchildFile = join(TEST_FIXTURES_DIR, 'labellableRoot-child-child.ttl');
      expect(existsSync(grandchildFile)).toBe(true);
      await loadTestFile(page, grandchildFile);

      const annotPropsContent = await openMenuAndReadText(page, 'annotationPropsMenu', 'labellableRoot');
      expect(annotPropsContent).toContain('core:labellableRoot');
    });
  });

  describe('B) Data and Object Properties from Imported Ontologies', () => {
    // base:hasProperty is declared only in properties-parent.ttl and never used in the child: it is known only
    // by reading the import, which is served here (#104).
    it('should display object properties from parent ontology in menu with prefix', async () => {
      const childFile = join(TEST_FIXTURES_DIR, 'properties-child.ttl');
      expect(existsSync(childFile)).toBe(true);
      await serveOntologies(page, TEST_FIXTURES_DIR);
      await loadTestFile(page, childFile);
      await waitForImportsSettled(page);

      const edgeStylesContent = await openMenuAndReadText(page, 'edgeStylesMenu', 'has property');
      expect(edgeStylesContent).toMatch(/base:hasProperty|base:has property/);
    });

    // base:name is declared an owl:DatatypeProperty only in properties-parent.ttl; from the child's usage alone
    // (a literal on an individual) it would be an annotation property. Reading the import (served here) fixes its kind (#104).
    it('should display data properties from parent ontology in menu with prefix', async () => {
      const childFile = join(TEST_FIXTURES_DIR, 'properties-child.ttl');
      await serveOntologies(page, TEST_FIXTURES_DIR);
      await loadTestFile(page, childFile);
      await waitForImportsSettled(page);

      const dataPropsContent = await openMenuAndReadText(page, 'dataPropsMenu', 'name');
      expect(dataPropsContent).toContain('base:name');
    });

    // Same as the two tests above; the grandchild neither uses base:hasProperty nor declares base:name, so they
    // come from the import of its import (#104).
    it('should display object and data properties from grandparent ontology in grandchild with prefix', async () => {
      const grandchildFile = join(TEST_FIXTURES_DIR, 'properties-child-child.ttl');
      expect(existsSync(grandchildFile)).toBe(true);
      await serveOntologies(page, TEST_FIXTURES_DIR);
      await loadTestFile(page, grandchildFile);
      await waitForImportsSettled(page);

      const edgeStylesContent = await openMenuAndReadText(page, 'edgeStylesMenu', 'has property');
      expect(edgeStylesContent).toMatch(/base:hasProperty|base:has property/);
      const dataPropsContent = await openMenuAndReadText(page, 'dataPropsMenu', 'name');
      expect(dataPropsContent).toContain('base:name');
    });
  });

  describe('C) Read-only Editing for Imported Items', () => {
    // External nodes (drawn from another ontology) open no edit modal on double-click by design, so this uses a
    // class declared locally but defined in the imported ontology (rdfs:isDefinedBy), which the modal makes read-only.
    it('should show warning icon and disable editing for imported classes', async () => {
      await openEditorWithTtl(page, `@prefix : <http://example.org/child#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/child> rdf:type owl:Ontology ; owl:imports <http://example.org/parent> .
:LocalClass rdf:type owl:Class ; rdfs:label "Local Class" .
:ImportedClass rdf:type owl:Class ; rdfs:label "Imported Class" ; rdfs:isDefinedBy <http://example.org/parent> .
`);

      await page.evaluate(() => (window as any).__EDITOR_TEST__.openRenameModal('ImportedClass'));
      await page.waitForSelector('#renameModal .imported-warning-icon', { state: 'visible', timeout: 5000 });
      const imported = await page.evaluate(() => ({
        title: (document.querySelector('#renameModal .imported-warning-icon') as HTMLElement).title,
        labelDisabled: (document.getElementById('renameInput') as HTMLInputElement).disabled,
        commentDisabled: (document.getElementById('renameComment') as HTMLTextAreaElement).disabled,
      }));
      expect(imported.title).toContain('http://example.org/parent');
      expect(imported.labelDisabled).toBe(true);
      expect(imported.commentDisabled).toBe(true);

      // A local class in the same ontology stays editable and shows no warning.
      await page.locator('#renameCancel').click();
      await page.waitForSelector('#renameModal', { state: 'hidden', timeout: 5000 });
      await page.evaluate(() => (window as any).__EDITOR_TEST__.openRenameModal('LocalClass'));
      await page.waitForSelector('#renameModal', { state: 'visible', timeout: 5000 });
      const local = await page.evaluate(() => ({
        warningVisible: !!document.querySelector('#renameModal .imported-warning-icon') &&
          getComputedStyle(document.querySelector('#renameModal .imported-warning-icon')!).display !== 'none',
        labelDisabled: (document.getElementById('renameInput') as HTMLInputElement).disabled,
      }));
      expect(local.warningVisible).toBe(false);
      expect(local.labelDisabled).toBe(false);
    });

    it('should show warning icon for imported object properties in edit modal', async () => {
      const childFile = join(TEST_FIXTURES_DIR, 'object-props-child.ttl');
      await loadTestFile(page, childFile);

      await openMenuAndReadText(page, 'edgeStylesMenu', 'connectsTo');
      await page.locator('#edgeStylesContent .edge-edit-btn[data-type="http://example.org/object-base#connectsTo"]').click();
      await page.waitForSelector('#editRelationshipTypeModal .imported-warning-icon', { state: 'visible', timeout: 5000 });
      const title = await page.evaluate(
        () => (document.querySelector('#editRelationshipTypeModal .imported-warning-icon') as HTMLElement).title
      );
      expect(title).toContain('http://example.org/object-base');
    });
  });

  describe('D) Styling Configuration for Imported Items', () => {
    it('should allow configuring opacity per external ontology in Manage External References', async () => {
      const childFile = join(TEST_FIXTURES_DIR, 'comprehensive-child.ttl');
      await loadTestFile(page, childFile);

      await page.locator('#manageExternalRefs').click();
      await page.waitForSelector('#externalRefsModal', { state: 'visible', timeout: 5000 });

      const hasOpacityControl = await page.evaluate(() => {
        const modal = document.getElementById('externalRefsModal');
        return modal?.querySelector('input[type="range"]') !== null ||
               modal?.querySelector('input[type="number"]') !== null ||
               false;
      });
      expect(hasOpacityControl).toBe(true);
    });

    // object-props-child.ttl (used before) draws no imported class at all; properties-child.ttl subclasses base:BaseClass.
    it('should apply configured opacity to imported classes', async () => {
      const childFile = join(TEST_FIXTURES_DIR, 'properties-child.ttl');
      await loadTestFile(page, childFile);

      const node = await getRenderedNode(page, 'http://example.org/base#BaseClass');
      expect(node).not.toBeNull();
      // Default opacity for an external ontology is 0.5 (50%).
      expect(node?.opacity).toBe(0.5);
      expect(node?.title).toContain('Imported from http://example.org/base');
    });

    it('should allow configuring opacity for grandparent ontologies in grandchild', async () => {
      const grandchildFile = join(TEST_FIXTURES_DIR, 'comprehensive-child-child.ttl');
      expect(existsSync(grandchildFile)).toBe(true);
      await loadTestFile(page, grandchildFile);

      await page.locator('#manageExternalRefs').click();
      await page.waitForSelector('#externalRefsModal', { state: 'visible', timeout: 5000 });

      const hasOpacityControl = await page.evaluate(() => {
        const modal = document.getElementById('externalRefsModal');
        return modal?.querySelector('input[type="range"]') !== null ||
               modal?.querySelector('input[type="number"]') !== null ||
               false;
      });
      expect(hasOpacityControl).toBe(true);
    });
  });

  describe('E) Data Properties from Imported Ontologies', () => {
    it('should display data property nodes from imported ontologies with transparency', async () => {
      const childFile = join(TEST_FIXTURES_DIR, 'data-props-child.ttl');
      await loadTestFile(page, childFile);

      // A data property restriction (owl:onDataRange) is drawn as a node with id __dataproprestrict__<class>__<property>.
      const node = await getRenderedNode(page, '__dataproprestrict__ExtendedEntity__createdDate');
      expect(node).not.toBeNull();
      expect(node?.opacity).toBeLessThanOrEqual(0.5);
      expect(node?.title).toContain('Imported from http://example.org/data-base');
    });

    // dpbase:identifier is used only in an owl:minCardinality restriction and "created date" is the label of
    // dpbase:createdDate in data-props-parent.ttl: both come from reading the import, served here (#104).
    it('should show imported data properties in data properties menu with prefix', async () => {
      const childFile = join(TEST_FIXTURES_DIR, 'data-props-child.ttl');
      await serveOntologies(page, TEST_FIXTURES_DIR);
      await loadTestFile(page, childFile);
      await waitForImportsSettled(page);

      const dataPropsContent = await openMenuAndReadText(page, 'dataPropsMenu', 'identifier');
      expect(dataPropsContent).toContain('dpbase:identifier');
      expect(dataPropsContent).toContain('created date');
    });

    // Same reason as above; the grandchild only restricts dpbase:identifier by cardinality (#104).
    it('should display data properties from grandparent ontology in grandchild with prefix', async () => {
      const grandchildFile = join(TEST_FIXTURES_DIR, 'data-props-child-child.ttl');
      expect(existsSync(grandchildFile)).toBe(true);
      await serveOntologies(page, TEST_FIXTURES_DIR);
      await loadTestFile(page, grandchildFile);
      await waitForImportsSettled(page);

      const dataPropsContent = await openMenuAndReadText(page, 'dataPropsMenu', 'identifier');
      expect(dataPropsContent).toContain('dpbase:identifier');
      expect(dataPropsContent).toContain('created date');
    });
  });

  describe('G) Declarations read from imports are context only (#104)', () => {
    it('are listed but never drawn on the canvas, and never written into the loaded ontology', async () => {
      await serveOntologies(page, TEST_FIXTURES_DIR);
      await loadTestFile(page, join(TEST_FIXTURES_DIR, 'properties-child.ttl'));
      await waitForImportsSettled(page);
      await openMenuAndReadText(page, 'dataPropsMenu', 'base:name');

      // base:name and base:hasProperty are known now, but no box or edge was added for them.
      const nodeIds = await page.evaluate(() => (window as any).__EDITOR_TEST__.getNetwork().body.nodeIndices.map(String) as string[]);
      expect(nodeIds.filter((id) => id.startsWith('__dataprop'))).toEqual([]);
      expect(await getRenderedEdgeIds(page)).toEqual(['ExtendedClass->http://example.org/base#BaseClass:subClassOf']);
      // The declarations stay in the imported ontology: nothing about them is in the store that would be saved.
      for (const term of ['hasProperty', 'name']) {
        expect(await page.evaluate((s) => (window as any).__EDITOR_TEST__.getQuads(s, null), 'http://example.org/base#' + term)).toEqual([]);
      }
    });

    it('cannot be edited or deleted: they are not in the loaded ontology', async () => {
      await serveOntologies(page, TEST_FIXTURES_DIR);
      await loadTestFile(page, join(TEST_FIXTURES_DIR, 'properties-child.ttl'));
      await waitForImportsSettled(page);
      await openMenuAndReadText(page, 'dataPropsMenu', 'base:name');
      await openMenuAndReadText(page, 'edgeStylesMenu', 'has property');
      expect(await page.locator('#dataPropsContent .data-prop-delete-btn[data-name="name"]').count()).toBe(0);
      expect(await page.locator('#edgeStylesContent .edge-delete-btn[data-type="http://example.org/base#hasProperty"]').count()).toBe(0);
      // No Edit button either, and the dialogs refuse them however they are reached: confirming one would write the
      // import's declaration into this ontology.
      expect(await page.locator('#dataPropsContent .data-prop-edit-btn[data-name="name"]').count()).toBe(0);
      expect(await page.locator('#edgeStylesContent .edge-edit-btn[data-type="http://example.org/base#hasProperty"]').count()).toBe(0);
      await page.evaluate(() => (window as any).__EDITOR_TEST__.openEditDataPropertyModal('name'));
      expect(await page.evaluate(() => getComputedStyle(document.getElementById('editDataPropertyModal')!).display)).toBe('none');
    });

    it('show the text of a label read from an import, never run it as markup', async () => {
      const markup = '<img src=x onerror="window.__xss=1">';
      const evil = `@prefix owl: <http://www.w3.org/2002/07/owl#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/evil> a owl:Ontology .
<http://example.org/evil#rel> a owl:ObjectProperty ; rdfs:label "${markup.replace(/"/g, '\\"')}" .
<http://example.org/evil#dp> a owl:DatatypeProperty ; rdfs:label "${markup.replace(/"/g, '\\"')}" .`;
      await serveOntologies(page, TEST_FIXTURES_DIR, { 'http://example.org/evil': evil });
      await openEditorWithTtl(
        page,
        `@prefix owl: <http://www.w3.org/2002/07/owl#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/victim> a owl:Ontology ; owl:imports <http://example.org/evil> .
<http://example.org/victim#A> a owl:Class ; rdfs:label "A" .`
      );
      await waitForImportsSettled(page);
      await openMenuAndReadText(page, 'edgeStylesMenu', 'img');
      await openMenuAndReadText(page, 'dataPropsMenu', 'img');

      expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
      expect(await page.locator('#edgeStylesContent img, #dataPropsContent img').count()).toBe(0);
      expect(await page.evaluate(() => document.getElementById('edgeStylesContent')!.textContent)).toContain('<img src=x');
      expect(await page.evaluate(() => document.getElementById('dataPropsContent')!.textContent)).toContain('<img src=x');
    });

    it('leave the imports unread, and the ontology as it was, when they cannot be fetched', async () => {
      await loadTestFile(page, join(TEST_FIXTURES_DIR, 'properties-child.ttl')); // example.org is blocked here
      await waitForImportsSettled(page);
      const dataPropsContent = await readMenuText(page, 'dataPropsMenu');
      expect(dataPropsContent).not.toContain('base:name');
    });
  });

  describe('F) Object Properties Connecting to Imported Classes', () => {
    // A restriction whose filler is an imported class (AnotherClass ⊑ ∃ base:importedObjectProp.base:BaseClass) draws its edge (#99).
    it('should display imported classes when connected via object properties', async () => {
      const childFile = join(TEST_FIXTURES_DIR, 'comprehensive-child.ttl');
      await loadTestFile(page, childFile);

      const node = await getRenderedNode(page, 'http://example.org/comprehensive-base#BaseClass');
      expect(node?.opacity).toBe(0.5);
      const edgeIds = await getRenderedEdgeIds(page);
      const edgeId = 'AnotherClass->http://example.org/comprehensive-base#BaseClass:http://example.org/comprehensive-base#importedObjectProp';
      expect(edgeIds).toContain(edgeId);

      // Read-only: the store writers resolve the filler as a class of this ontology.
      await page.evaluate((id) => (window as any).__EDITOR_TEST__.editEdge(id), edgeId);
      const modalState = () =>
        page.evaluate(() => ({
          open: (document.getElementById('editEdgeModal') as HTMLElement).style.display !== 'none',
          confirmDisabled: (document.getElementById('editEdgeConfirm') as HTMLButtonElement).disabled,
          notice: document.getElementById('editEdgeRestrictionNotice')?.textContent ?? '',
        }));
      await expect.poll(modalState).toMatchObject({ open: true, confirmDisabled: true });
      expect((await modalState()).notice).toContain("isn't available yet");
      await page.click('#editEdgeCancel');
    });

    it('should display edges connecting child classes to imported parent classes', async () => {
      const childFile = join(TEST_FIXTURES_DIR, 'properties-child.ttl');
      await loadTestFile(page, childFile);

      const edgeIds = await getRenderedEdgeIds(page);
      expect(edgeIds).toContain('ExtendedClass->http://example.org/base#BaseClass:subClassOf');
    });

    // The grandchild case of "imported class connected via an object property" has no fixture (object-props-child-child.ttl
    // only subclasses extended:ChildClass); the drawn grandparent class is covered in importedPropertyPrefixes.e2e.test.ts
    // ("should display external class with opacity when referenced in subClassOf").
  });
});
