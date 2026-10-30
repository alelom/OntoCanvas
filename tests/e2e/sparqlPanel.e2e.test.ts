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

  it('selects the classes and the relationships a result names in the graph, and offers nothing for a result that names none (#203)', async () => {
    const selected = () => page.evaluate(() => ({ nodes: (window as any).__EDITOR_TEST__.getSelectedNodes(), edges: (window as any).__EDITOR_TEST__.getSelectedEdges() }));
    const query = async (text: string) => {
      await page.locator(EDITOR).fill(text);
      await page.click('[data-query-run]');
      await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('[data-query-run]')!.disabled);
    };

    await query('PREFIX owl: <http://www.w3.org/2002/07/owl#> SELECT ?c WHERE { ?c a owl:Class } ORDER BY ?c');
    expect(await page.locator('[data-query-show-in-graph]').textContent()).toContain('2 classes');
    await page.click('[data-query-show-in-graph]');
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.getSelectedNodes().length === 2);
    expect((await selected()).nodes.sort()).toEqual(['Person', 'Student']);

    await query('PREFIX : <http://example.org/o#> SELECT DISTINCT ?p WHERE { :Student ?p :Person }');
    expect(await page.locator('[data-query-show-in-graph]').textContent()).toContain('1 relationship');
    await page.click('[data-query-show-in-graph]');
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.getSelectedEdges().length === 1);
    expect(await selected()).toEqual({ nodes: [], edges: ['Student->Person:subClassOf'] });

    await query('SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }');
    expect(await page.locator('[data-query-show-in-graph]').count()).toBe(0);
  });

  it('adds a data file in the Individuals tab, queries it with the ontology from the Query tab, and forgets it on Remove (#205, #211)', async () => {
    const DATA = '@prefix : <http://example.org/o#> .\n:alice a :Student .\n:bob a :Person .\n';
    const query = 'PREFIX : <http://example.org/o#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> SELECT ?p WHERE { ?p a ?c . ?c rdfs:subClassOf* :Student } ORDER BY ?p';
    const rowsOf = async () => {
      await page.click('[data-tab-button="query"]');
      await page.locator(EDITOR).fill(query);
      await page.click('[data-query-run]');
      await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('[data-query-run]')!.disabled);
      return page.locator('.query-results tbody td').allTextContents();
    };

    expect(await rowsOf()).toEqual([]);
    // Nothing is added: the button invites adding, and the Query tab has no line about data.
    expect(await page.locator('#individualsPanelBtn').innerText()).toBe('Add individuals');
    expect(await page.locator('[data-query-data-summary]').isHidden()).toBe(true);

    await page.click('[data-tab-button="individuals"]');
    await page.setInputFiles('[data-add-file-input]', { name: 'people.ttl', mimeType: 'text/turtle', buffer: Buffer.from(DATA) });
    await page.locator('[data-data-list] li').waitFor();
    expect(await page.locator('[data-data-list] li').first().innerText()).toContain('people.ttl');
    expect(await page.locator('[data-data-list] li').first().innerText()).toContain('2 triples');
    expect(await page.locator('#individualsPanelBtn').innerText()).toBe('Individuals (2)');

    expect(await rowsOf()).toEqual([':alice']);
    expect(await page.locator('[data-query-data-summary]').innerText()).toContain('Querying the ontology and 1 data file');
    // The individuals are not drawn: the graph still shows the two classes only.
    expect(await page.evaluate(() => (window as any).__EDITOR_TEST__.getNodeIds().length)).toBe(2);

    // The line in the Query tab leads to where the data is managed.
    await page.click('[data-query-data-manage]');
    await page.locator('[data-data-list] li').waitFor({ state: 'visible' });
    await page.click('[data-data-remove]');
    await page.waitForFunction(() => document.querySelectorAll('[data-data-list] li').length === 0);
    expect(await page.locator('#individualsPanelBtn').innerText()).toBe('Add individuals');
    expect(await rowsOf()).toEqual([]);
    expect(await page.locator('[data-query-data-summary]').isHidden()).toBe(true);
  });

  it('opens the Individuals tab from its toolbar button, next to the SPARQL one, and browses what is added (#208, #211)', async () => {
    const DATA = '@prefix : <http://example.org/o#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n:alice a :Student ; rdfs:label "Alice" ; :knows :bob .\n:bob a :Person ; rdfs:label "Bob" .\n';
    expect(await page.locator('.vis-manipulation > #queryPanelBtn + #individualsPanelBtn').count()).toBe(1);
    await page.click('[data-tab-button="individuals"]');
    await page.setInputFiles('[data-add-file-input]', { name: 'people.ttl', mimeType: 'text/turtle', buffer: Buffer.from(DATA) });
    await page.locator('[data-data-list] li').waitFor();

    await page.locator('[data-individuals-class]').waitFor();
    expect(await page.locator('[data-individuals-class] option').allTextContents()).toEqual(['All (2)', 'Person (1)', 'Student (1)']);

    await page.selectOption('[data-individuals-class]', 'http://example.org/o#Student');
    expect(await page.locator('[data-individuals-list] li').count()).toBe(1);
    await page.click('[data-individuals-item]');
    const detail = await page.locator('[data-individuals-detail]').innerText();
    expect(detail).toContain('Alice');
    expect(detail).toContain('http://example.org/o#alice');
    await page.click('[data-individuals-outgoing] [data-individuals-follow]');
    expect(await page.locator('[data-individuals-detail] h4').innerText()).toBe('Bob');

    // The individuals are not drawn: the graph still shows the two classes only.
    expect(await page.evaluate(() => (window as any).__EDITOR_TEST__.getNodeIds().length)).toBe(2);

    // The toolbar button closes the panel when its own tab is the one showing, and opens it again on that tab.
    expect(await page.locator('#individualsPanelBtn').getAttribute('aria-pressed')).toBe('true');
    await page.click('#individualsPanelBtn');
    expect(await page.locator('#sidePanel').isHidden()).toBe(true);
    await page.click('#individualsPanelBtn');
    await page.locator('[data-individuals-class]').waitFor({ state: 'visible' });

    await page.click('[data-data-remove]');
    await page.waitForFunction(() => /no individuals/i.test(document.querySelector('[data-individuals-empty]')?.textContent ?? ''));
  });

  it('refuses a data file that is too large without reading it, and says why (#205)', async () => {
    await page.click('[data-tab-button="individuals"]');
    await page.setInputFiles('[data-add-file-input]', { name: 'huge.ttl', mimeType: 'text/turtle', buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 'a') });

    await page.waitForFunction(() => /too large/i.test(document.querySelector('[data-data-status]')?.textContent ?? ''));
    expect(await page.locator('[data-data-list] li').count()).toBe(0);
  });

  it('opens the Individuals tab from the button of the notice about individuals that are not drawn (#211)', async () => {
    const WITH_INDIVIDUALS = '@prefix : <http://example.org/n#> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n<http://example.org/n> a owl:Ontology .\n:Room a owl:Class .\n:r1 a :Room ; rdfs:label "Room one" .\n';
    await page.evaluate((t) => (window as any).__EDITOR_TEST__.loadTtlDirectly(t), WITH_INDIVIDUALS);
    await waitForAppReady(page);
    await page.click('[data-side-panel-close]');
    expect(await page.locator('#sidePanel').isHidden()).toBe(true);
    await page.waitForFunction(() => getComputedStyle(document.getElementById('ontologyIssuesBtn')!).display !== 'none');

    await page.click('#ontologyIssuesBtn');
    await page.click('[data-issue-action="open-individuals"]');

    await page.locator('[data-individuals-class]').waitFor({ state: 'visible' });
    expect(await page.locator('#sidePanel').isVisible()).toBe(true);
    expect(await page.locator('[data-individuals-list] li').first().innerText()).toContain('Room one');
    expect(await page.locator('#ontologyIssuesPopup').isHidden()).toBe(true);
    await page.evaluate((t) => (window as any).__EDITOR_TEST__.loadTtlDirectly(t), TTL);
    await waitForAppReady(page);
  });

  it('closes, giving the room back to the graph', async () => {
    const open = await networkWidth();

    await page.click('[data-side-panel-close]');

    await page.waitForFunction((w) => document.getElementById('networkWrapper')!.getBoundingClientRect().width > w, open);
    expect(await page.locator('#sidePanel').isHidden()).toBe(true);
  });
});
