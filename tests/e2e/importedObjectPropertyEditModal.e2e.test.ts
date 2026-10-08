/**
 * Comprehensive E2E tests for imported object property edit modal.
 * Tests warning icons, field editability, and isDefinedBy handling.
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
const CHILD_FILE = join(TEST_FIXTURES_DIR, 'object-props-child.ttl');
const PARENT_FILE = join(TEST_FIXTURES_DIR, 'object-props-parent.ttl');
const CONNECTS_TO_URI = 'http://example.org/object-base#connectsTo';

/** Wait until the element's computed display is (or is not) `none`. */
async function waitForDisplayed(page: Page, id: string, displayed: boolean): Promise<void> {
  await page.waitForFunction(
    ({ id, displayed }) => {
      const el = document.getElementById(id);
      return !!el && (getComputedStyle(el).display !== 'none') === displayed;
    },
    { id, displayed },
    { timeout: 5000 }
  );
}

/** Open the Object Properties menu and click the edit button of `type`, the way a user does, then wait for the modal. */
async function openObjectPropertyEditor(page: Page, type: string): Promise<void> {
  await page.locator('#edgeStylesMenu summary').click();
  await page.locator(`#edgeStylesContent .edge-edit-btn[data-type="${type}"]`).click();
  await waitForDisplayed(page, 'editRelationshipTypeModal', true);
}

/** State of the warning icon in the edit object property modal's header. */
function warningIconInfo(page: Page) {
  return page.evaluate(() => {
    const modal = document.getElementById('editRelationshipTypeModal');
    const warningIcon = modal?.querySelector('.modal-header-icons .imported-warning-icon') as HTMLElement | null;
    return {
      exists: warningIcon !== null,
      visible: warningIcon !== null && warningIcon.offsetParent !== null && getComputedStyle(warningIcon).display !== 'none',
      hasPulse: warningIcon?.classList.contains('warning-icon-pulse') ?? false,
      animationName: warningIcon ? getComputedStyle(warningIcon).animationName : '',
      text: warningIcon?.textContent?.trim() ?? '',
      title: warningIcon?.title ?? '',
    };
  });
}

/**
 * Click the modal's warning icon. It pulses forever by design, so it is never "stable" in Playwright's
 * sense; `force` skips only that check and still clicks it with the mouse.
 */
async function clickWarningIcon(page: Page): Promise<void> {
  await page.locator('#editRelationshipTypeModal .imported-warning-icon').click({ force: true });
}

/** Whether the warning popover in the edit object property modal is shown. */
function popoverVisible(page: Page) {
  return page.evaluate(() => {
    const popover = document.querySelector('#editRelationshipTypeModal .modal-content .warning-icon-popover');
    return popover !== null && popover.classList.contains('rename-popover-visible');
  });
}

describe('Imported Object Property Edit Modal E2E', () => {
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

  describe('Warning Icon and Field Editability', () => {
    it('should display h3 title "Edit object property" in the modal', async () => {
      expect(existsSync(CHILD_FILE)).toBe(true);
      await loadTestFile(page, CHILD_FILE);
      await openObjectPropertyEditor(page, CONNECTS_TO_URI);

      const h3Visible = await page.evaluate(() => {
        const h3 = document.getElementById('editRelationshipTypeModal')?.querySelector('h3');
        return !!h3 && h3.textContent?.trim() === 'Edit object property' &&
          h3.offsetParent !== null && getComputedStyle(h3).display !== 'none';
      });
      expect(h3Visible).toBe(true);
    });

    it('should show warning icon and disable all fields when object property has isDefinedBy set (from parent ontology)', async () => {
      expect(existsSync(CHILD_FILE)).toBe(true);
      await loadTestFile(page, CHILD_FILE);
      await openObjectPropertyEditor(page, CONNECTS_TO_URI);

      const warning = await warningIconInfo(page);
      expect(warning.exists).toBe(true);
      expect(warning.visible).toBe(true);
      expect(warning.hasPulse).toBe(true);
      expect(warning.text).toBe('⚠️');

      const fields = await page.evaluate(() => {
        const get = (id: string) => document.getElementById(id) as HTMLInputElement | null;
        return {
          labelDisabled: get('editRelTypeLabel')?.disabled ?? false,
          commentDisabled: get('editRelTypeComment')?.disabled ?? false,
          domainDisabled: get('editRelTypeDomain')?.disabled ?? false,
          rangeDisabled: get('editRelTypeRange')?.disabled ?? false,
          subPropertyOfDisabled: get('editRelTypeSubPropertyOf')?.disabled ?? false,
          definedByDisabled: get('editRelTypeDefinedBy')?.disabled ?? false,
          definedBy: get('editRelTypeDefinedBy')?.value ?? '',
          labelOpacity: get('editRelTypeLabel')?.style.opacity,
          commentOpacity: get('editRelTypeComment')?.style.opacity,
        };
      });
      expect(fields.labelDisabled).toBe(true);
      expect(fields.commentDisabled).toBe(true);
      expect(fields.domainDisabled).toBe(true);
      expect(fields.rangeDisabled).toBe(true);
      expect(fields.subPropertyOfDisabled).toBe(true);
      expect(fields.definedByDisabled).toBe(true); // Always non-editable
      expect(fields.definedBy).toBe('http://example.org/object-base');
      expect(fields.labelOpacity).toBe('0.5');
      expect(fields.commentOpacity).toBe('0.5');
    });

    it('should show warning icon and disable fields when object property is imported but has no isDefinedBy (detected by URI)', async () => {
      // ext:linksTo is declared here without rdfs:isDefinedBy; only its namespace says it is imported.
      await openEditorWithTtl(page, `@prefix : <http://example.org/local#> .
@prefix ext: <http://example.org/ext#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/local> rdf:type owl:Ontology ; owl:imports <http://example.org/ext> .
ext:linksTo rdf:type owl:ObjectProperty .
:A rdf:type owl:Class ; rdfs:subClassOf [ rdf:type owl:Restriction ; owl:onProperty ext:linksTo ; owl:someValuesFrom :B ] .
:B rdf:type owl:Class .
`);
      const definedByQuads = await page.evaluate(() =>
        (window as any).__EDITOR_TEST__.getQuads('http://example.org/ext#linksTo', 'http://www.w3.org/2000/01/rdf-schema#isDefinedBy'));
      expect(definedByQuads).toEqual([]);

      await openObjectPropertyEditor(page, 'http://example.org/ext#linksTo');

      const warning = await warningIconInfo(page);
      expect(warning.exists).toBe(true);
      expect(warning.visible).toBe(true);

      const fields = await page.evaluate(() => {
        const label = document.getElementById('editRelTypeLabel') as HTMLInputElement;
        const comment = document.getElementById('editRelTypeComment') as HTMLTextAreaElement;
        return { labelDisabled: label.disabled, commentDisabled: comment.disabled, labelOpacity: label.style.opacity };
      });
      expect(fields.labelDisabled).toBe(true);
      expect(fields.commentDisabled).toBe(true);
      expect(fields.labelOpacity).toBe('0.5');
    });

    it('should NOT show warning icon and enable fields when object property is locally defined', async () => {
      expect(existsSync(PARENT_FILE)).toBe(true);
      await loadTestFile(page, PARENT_FILE);
      await openObjectPropertyEditor(page, 'connectsTo');

      const warning = await warningIconInfo(page);
      expect(warning.exists).toBe(false);

      const fields = await page.evaluate(() => {
        const get = (id: string) => document.getElementById(id) as HTMLInputElement;
        return {
          labelEnabled: !get('editRelTypeLabel').disabled,
          commentEnabled: !get('editRelTypeComment').disabled,
          domainEnabled: !get('editRelTypeDomain').disabled,
          rangeEnabled: !get('editRelTypeRange').disabled,
          definedByDisabled: get('editRelTypeDefinedBy').disabled, // Always disabled
          labelOpacity: get('editRelTypeLabel').style.opacity,
          commentOpacity: get('editRelTypeComment').style.opacity,
        };
      });
      expect(fields.labelEnabled).toBe(true);
      expect(fields.commentEnabled).toBe(true);
      expect(fields.domainEnabled).toBe(true);
      expect(fields.rangeEnabled).toBe(true);
      expect(fields.definedByDisabled).toBe(true); // Always non-editable
      expect(fields.labelOpacity).not.toBe('0.5');
      expect(fields.commentOpacity).not.toBe('0.5');
    });

    it('should show correct warning message tooltip on hover', async () => {
      await loadTestFile(page, CHILD_FILE);
      await openObjectPropertyEditor(page, CONNECTS_TO_URI);

      // The hover tooltip is the icon's native title attribute.
      const { title } = await warningIconInfo(page);
      expect(title).toContain('external ontology http://example.org/object-base');
      expect(title).toContain('must be edited by opening that ontology');
    });

    it('should show warning message popover when clicking warning icon', async () => {
      await loadTestFile(page, CHILD_FILE);
      await openObjectPropertyEditor(page, CONNECTS_TO_URI);

      await clickWarningIcon(page);
      await expect.poll(() => popoverVisible(page), { timeout: 5000 }).toBe(true);

      const message = await page.evaluate(() =>
        document.querySelector('#editRelationshipTypeModal .warning-icon-popover')?.textContent?.trim() ?? '');
      expect(message).toContain('external ontology');
      expect(message).toContain('must be edited by opening that ontology');
    });

    it('should hide warning popover when clicking outside', async () => {
      await loadTestFile(page, CHILD_FILE);
      await openObjectPropertyEditor(page, CONNECTS_TO_URI);

      await clickWarningIcon(page);
      await expect.poll(() => popoverVisible(page), { timeout: 5000 }).toBe(true);

      // The app registers its click-outside listener in a setTimeout(0) after showing the popover. A
      // zero-delay timer queued now runs after that one, so the listener is in place before we click.
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
      // Click the title: outside the popover and the icon (a label would count as disabled, like its field).
      await page.locator('#editRelationshipTypeModal h3').click();
      await expect.poll(() => popoverVisible(page), { timeout: 5000 }).toBe(false);
    });

    it('should have pulsating animation on warning icon', async () => {
      await loadTestFile(page, CHILD_FILE);
      await openObjectPropertyEditor(page, CONNECTS_TO_URI);

      const warning = await warningIconInfo(page);
      expect(warning.hasPulse).toBe(true);
      expect(warning.animationName).toBe('warning-icon-pulse');
    });
  });
});
