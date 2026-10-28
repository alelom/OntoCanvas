/**
 * Annotation editing, end to end, on an ontology opened by URL (served by a route):
 *  - #140 a textual annotation value can be added to a class in its edit dialog (it used to be read-only unless the
 *    file was opened with the file picker), and OK writes it to the store;
 *  - #139 the Edit annotation property dialog lists where the property is used, collapsed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { waitForAppReady } from './testHelpers';
import { EDITOR_URL } from './editorUrl';

const URL_ = 'https://examples.test/annotations.ttl';
const NS = 'http://example.org/ann#';
const TTL = `@prefix : <${NS}> . @prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<http://example.org/ann> rdf:type owl:Ontology .
:hint rdf:type owl:AnnotationProperty ; rdfs:range xsd:string .
:A rdf:type owl:Class ; rdfs:label "A" ; :hint "old hint" .
:B rdf:type owl:Class ; rdfs:label "B" ; :hint "b hint" .
`;

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
  await page.route(URL_, (route) => route.fulfill({ status: 200, contentType: 'text/turtle', headers: { 'access-control-allow-origin': '*' }, body: TTL }));
  await page.goto(`${EDITOR_URL}?onto=${encodeURIComponent(URL_)}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await waitForAppReady(page);
});
afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

describe('annotation editing on an ontology opened by URL', () => {
  it('adds a textual annotation value to a class in its edit dialog, and OK saves it (#140)', async () => {
    await page.evaluate(() => (window as any).__EDITOR_TEST__.openRenameModal('A'));
    await page.locator('#renameAnnotationPropsList input[type="text"]').fill('new hint');
    await page.locator('#renameAnnotationPropsList button', { hasText: 'Add' }).click();
    await page.locator('#renameConfirm').click();
    const values = await page.evaluate(
      (p) => (window as any).__EDITOR_TEST__.getTtlStore().getQuads(`${p}A`, `${p}hint`, null, null).map((q: { object: { value: string } }) => q.object.value),
      NS
    );
    expect(values.sort()).toEqual(['new hint', 'old hint']);
  });

  it('lists where an annotation property is used in its edit dialog, collapsed (#139)', async () => {
    await page.locator('details#annotationPropsMenu > summary').click();
    await page.locator('#annotationPropsContent .annotation-prop-edit-btn[data-name="hint"]').click();
    const usages = page.locator('#editAnnotationPropUsages');
    expect(await usages.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false);
    expect(await usages.locator('summary').textContent()).toBe('Where it is used (2)');
    expect(await usages.locator('.annotation-usage').allTextContents()).toEqual(['A (class): old hint', 'B (class): b hint']);
  });
});
