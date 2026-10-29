/**
 * E2E: the SPARQL side panel in the built app (#171). The pure parts are unit-tested; this covers what only the
 * page can show: the panel takes room from the graph and gives it back, opening it loads nothing, Run loads the
 * engine and fills the table.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { openEditorWithTtl, waitForAppReady } from './testHelpers';

const TTL = `
@prefix : <http://example.org/o#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/o> a owl:Ontology .
:Person a owl:Class ; rdfs:label "Person" .
:Student a owl:Class ; rdfs:label "Student"@en ; rdfs:subClassOf :Person .
`;
// Another ontology, with an IRI of its own: its history is kept apart from that of TTL (#182).
const OTHER_TTL = `
@prefix : <http://example.org/other#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/other> a owl:Ontology .
:Room a owl:Class ; rdfs:label "Room" .
`;
const isEngineRequest = (u: string) => /index-browser|comunica|runQuery/i.test(u);
const isEditorRequest = (u: string) => /codeMirrorEditor/i.test(u);
const EDITOR = '[data-query-editor][data-editor="codemirror"] .cm-content';

describe('SPARQL side panel', () => {
  let browser: Browser;
  let page: Page;
  const requested: string[] = [];

  const networkWidth = () => page.evaluate(() => document.getElementById('networkWrapper')!.getBoundingClientRect().width);

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    page.on('request', (req) => requested.push(req.url()));
    await openEditorWithTtl(page, TTL);
  });

  afterAll(async () => {
    await browser?.close();
  });

  it('is closed at first, and opening it takes room from the graph without loading the engine', async () => {
    expect(await page.locator('#sidePanel').isHidden()).toBe(true);
    // The button is in the graph's own toolbar, right after Add Edge, and not in the page toolbar or the bottom bar.
    expect(await page.locator('.vis-manipulation > .vis-connect + .vis-separator-line + #queryPanelBtn').count()).toBe(1);
    expect(await page.locator('#controls #queryPanelBtn, #info #queryPanelBtn').count()).toBe(0);
    expect(requested.filter(isEditorRequest)).toEqual([]);
    const before = await networkWidth();

    await page.click('#queryPanelBtn');
    await page.locator('#sidePanel').waitFor({ state: 'visible' });

    await page.waitForFunction((w) => document.getElementById('networkWrapper')!.getBoundingClientRect().width < w, before);
    expect(requested.filter(isEngineRequest)).toEqual([]);
  });

  it('swaps the plain textarea for a SPARQL editor that colours the query', async () => {
    await page.locator(EDITOR).waitFor();

    expect(await page.locator('[data-query-editor] textarea').count()).toBe(0);
    const colours = await page.evaluate(() => {
      const spans = [...document.querySelectorAll('.cm-content .cm-line span')] as HTMLElement[];
      return new Set(spans.map((s) => getComputedStyle(s).color)).size;
    });
    expect(colours).toBeGreaterThan(1);
  });

  it('keeps Ctrl+Z for the query editor: it undoes the typing, not an edit of the ontology (#180)', async () => {
    // An undoable edit of the ontology, as the app records one.
    await page.evaluate(() => {
      (window as any).__undone = false;
      (window as any).__EDITOR_TEST__.pushUndoable(() => ((window as any).__undone = true), () => {});
    });
    const stack = () => page.evaluate(() => (window as any).__EDITOR_TEST__.getUndoStackLength());
    const before = await stack();

    await page.locator(EDITOR).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('# typed marker');
    expect(await page.locator(EDITOR).innerText()).toContain('# typed marker');
    await page.keyboard.press('Control+z');

    expect(await page.locator(EDITOR).innerText()).not.toContain('# typed marker');
    expect(await stack()).toBe(before);
    expect(await page.evaluate(() => (window as any).__undone)).toBe(false);

    // With the focus outside any field, Ctrl+Z still undoes the ontology.
    await page.locator('.query-note').first().click();
    await page.keyboard.press('Control+z');
    await page.waitForFunction(() => (window as any).__undone === true);
    expect(await stack()).toBe(before - 1);
  });

  it('starts with the file\'s prefixes, runs the query and shows the classes as prefixed names', async () => {
    expect(await page.locator(EDITOR).innerText()).toContain('PREFIX : <http://example.org/o#>');
    await page.locator(EDITOR).fill(
      'PREFIX : <http://example.org/o#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> ' +
        'SELECT ?c ?l WHERE { ?c rdfs:label ?l } ORDER BY ?c'
    );

    await page.click('[data-query-run]');
    await page.locator('.query-results tbody tr').first().waitFor();

    expect(await page.locator('.query-results th').allTextContents()).toEqual(['?c', '?l']);
    expect(await page.locator('.query-results tbody td').allTextContents()).toEqual([':Person', '"Person"', ':Student', '"Student"@en']);
    expect(await page.textContent('[data-query-status]')).toMatch(/2 rows/);
    expect(requested.some(isEngineRequest)).toBe(true);
  });

  it('shows the error of an update query instead of running it', async () => {
    await page.locator(EDITOR).fill('DELETE WHERE { ?s ?p ?o }');
    await page.click('[data-query-run]');

    expect(await page.locator('[data-query-error]').textContent()).toMatch(/read-only/i);
  });

  it('keeps the queries run on a file for the next visit, and puts a chosen one in the editor without running it (#182)', async () => {
    // The two queries above were run on this ontology: they are in the selector.
    expect(await page.locator('[data-query-history] option').count()).toBe(3); // the placeholder and two queries

    // A returning visit: a new context that starts with the local storage of this one, the same ontology opened again.
    const returning = await browser.newContext({ storageState: await page.context().storageState() });
    const next = await returning.newPage();
    next.setDefaultTimeout(5000);
    try {
      await openEditorWithTtl(next, TTL);
      await next.click('#queryPanelBtn');
      await next.locator(EDITOR).waitFor();

      const labels = await next.locator('[data-query-history] option').allTextContents();
      expect(labels).toHaveLength(3);
      expect(labels[1]).toContain('DELETE WHERE'); // the newest first
      expect(labels[2]).toContain('SELECT ?c ?l WHERE');

      await next.locator('[data-query-history]').selectOption({ index: 2 });

      expect(await next.locator(EDITOR).innerText()).toContain('SELECT ?c ?l WHERE { ?c rdfs:label ?l } ORDER BY ?c');
      expect(await next.locator('.query-results').count()).toBe(0); // choosing does not run it
      expect(await next.locator('[data-query-history]').inputValue()).toBe('');
    } finally {
      await returning.close();
    }
  });

  it('shows the history of the ontology that is open when another is opened with the panel showing, and Clear clears only that one (#196 review)', async () => {
    const load = async (ttl: string) => {
      await page.evaluate((t) => (window as any).__EDITOR_TEST__.loadTtlDirectly(t), ttl);
      await waitForAppReady(page);
    };
    const labels = () => page.locator('[data-query-history] option').allTextContents();

    // Another ontology: none of the first one's queries, and one of its own after a run.
    await load(OTHER_TTL);
    expect(await page.locator('[data-query-history-row]').isHidden()).toBe(true);
    await page.locator(EDITOR).fill('ASK { ?s ?p ?o }');
    await page.click('[data-query-run]');
    await page.waitForFunction(() => document.querySelectorAll('[data-query-history] option').length === 2);

    // Back to the first: its own queries (the newest is the DELETE of an earlier test), not the other's ASK.
    await load(TTL);
    const first = await labels();
    expect(first).toHaveLength(3);
    expect(first[1]).toContain('DELETE WHERE');

    await page.click('[data-query-history-clear]');
    expect(await page.locator('[data-query-history-row]').isHidden()).toBe(true);

    // The other ontology's history is untouched by that Clear.
    await load(OTHER_TTL);
    const other = await labels();
    expect(other).toHaveLength(2);
    expect(other[1]).toContain('ASK');
    await load(TTL);
  });

  it('closes, giving the room back to the graph', async () => {
    const open = await networkWidth();

    await page.click('[data-side-panel-close]');

    await page.waitForFunction((w) => document.getElementById('networkWrapper')!.getBoundingClientRect().width > w, open);
    expect(await page.locator('#sidePanel').isHidden()).toBe(true);
  });
});
