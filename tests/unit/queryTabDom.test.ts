// @vitest-environment jsdom
/**
 * The query tab of the side panel (#171). The query runner is injected, so these tests exercise the tab
 * (what it shows, when it runs) without loading the engine.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Store, DataFactory } from 'n3';
import { createQueryTab } from '../../src/ui/sidePanel/queryTab';
import type { QueryResult } from '../../src/sparql/runQuery';
import { MAX_ROWS_SHOWN } from '../../src/sparql/resultView';

const { namedNode, literal, quad } = DataFactory;
const prefixes = { '': 'http://example.org/o#' };
const iri = (s: string) => namedNode(`http://example.org/o#${s}`);

let container: HTMLElement;
let store: Store | null;
let currentPrefixes: Record<string, string>;
let run: ReturnType<typeof vi.fn>;

/** The CodeMirror chunk never arrives here, so the plain textarea is what is tested (the swap: queryTabEditorSwap.test.ts). */
const neverLoads = () => new Promise<never>(() => {});
const mount = () => {
  const tab = createQueryTab({ getStore: () => store, getPrefixes: () => currentPrefixes, run: (...args) => run(...args), loadEditor: neverLoads });
  tab.render(container);
  return tab;
};
const editor = () => container.querySelector<HTMLTextAreaElement>('[data-query-editor] textarea')!;
const runButton = () => container.querySelector<HTMLButtonElement>('[data-query-run]')!;
const status = () => container.querySelector<HTMLElement>('[data-query-status]')!;
const error = () => container.querySelector<HTMLElement>('[data-query-error]');
const clickRun = async () => {
  runButton().click();
  await vi.waitFor(() => expect(runButton().disabled).toBe(false));
};

beforeEach(() => {
  document.body.replaceChildren();
  container = document.createElement('div');
  document.body.append(container);
  store = new Store();
  currentPrefixes = { ...prefixes };
  run = vi.fn();
});

describe('query tab', () => {
  it('starts with the prefixes of the open file and a starter query, and runs nothing yet', () => {
    mount();

    expect(editor().value).toContain('PREFIX : <http://example.org/o#>');
    expect(editor().value).toContain('PREFIX owl: <http://www.w3.org/2002/07/owl#>');
    expect(editor().value).toMatch(/SELECT/);
    expect(run).not.toHaveBeenCalled();
  });

  describe('the starter query (#181)', () => {
    const RDF_TYPE = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');

    it('lists the classes of a file that has none of the individuals', () => {
      store!.add(quad(iri('Room'), RDF_TYPE, namedNode('http://www.w3.org/2002/07/owl#Class')));
      mount();
      expect(editor().value).toContain('?class a owl:Class');
      expect(editor().value).not.toContain('?individual');
    });

    it('lists the individuals of a file that has some, with their classes', () => {
      store!.add(quad(iri('r1'), RDF_TYPE, iri('Room')));
      mount();
      expect(editor().value).toContain('?individual a ?class');
      expect(editor().value).not.toContain('?class a owl:Class');
      expect(editor().value).toContain('PREFIX : <http://example.org/o#>');
    });

    it('changes with the file, when the user has not edited the query', () => {
      const tab = mount();
      expect(editor().value).toContain('?class a owl:Class');

      store = new Store([quad(iri('r1'), RDF_TYPE, iri('Room'))]);
      tab.refresh();

      expect(editor().value).toContain('?individual a ?class');
    });
  });

  it('says that external stub classes are not part of the data', () => {
    mount();
    expect(container.textContent).toMatch(/external/i);
  });

  it('runs the text of the editor against the store and shows a table', async () => {
    run.mockResolvedValue({
      kind: 'bindings',
      variables: ['c', 'l'],
      rows: [{ c: iri('A'), l: literal('Alpha', 'en') }, { c: iri('B') }],
    } satisfies QueryResult);
    mount();
    editor().value = 'SELECT ?c ?l WHERE { ?c ?p ?l }';

    await clickRun();

    expect(run).toHaveBeenCalledWith([store], 'SELECT ?c ?l WHERE { ?c ?p ?l }', expect.objectContaining({ limit: MAX_ROWS_SHOWN }));
    expect([...container.querySelectorAll('th')].map((th) => th.textContent)).toEqual(['?c', '?l']);
    const cells = [...container.querySelectorAll('tbody td')].map((td) => td.textContent);
    expect(cells).toEqual([':A', '"Alpha"@en', ':B', '']);
    expect(container.querySelector('tbody td')?.getAttribute('title')).toBe('http://example.org/o#A');
    expect(status().textContent).toMatch(/2 rows/);
  });

  it('shortens rdf, rdfs, owl and xsd names even when the file declares none of them', async () => {
    currentPrefixes = {};
    run.mockResolvedValue({
      kind: 'bindings',
      variables: ['n', 'p'],
      rows: [
        {
          n: literal('5', namedNode('http://www.w3.org/2001/XMLSchema#integer')),
          p: namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
        },
      ],
    } satisfies QueryResult);
    mount();

    await clickRun();

    expect([...container.querySelectorAll('tbody td')].map((td) => td.textContent)).toEqual(['"5"^^xsd:integer', 'rdfs:subClassOf']);
  });

  it('marks an IRI shown in full, so it can wrap and keep its local name visible', async () => {
    run.mockResolvedValue({
      kind: 'bindings',
      variables: ['c', 'd'],
      rows: [{ c: iri('A'), d: namedNode('http://elsewhere.org/a/very/long/path/Name') }],
    } satisfies QueryResult);
    mount();

    await clickRun();

    const [prefixed, full] = [...container.querySelectorAll('tbody td')];
    expect(prefixed.classList.contains('term-iri-full')).toBe(false);
    expect(full.classList.contains('term-iri-full')).toBe(true);
  });

  it('draws the first rows of a big result and says there are more', async () => {
    const rows = Array.from({ length: MAX_ROWS_SHOWN }, (_, i) => ({ c: iri(`C${i}`) }));
    run.mockResolvedValue({ kind: 'bindings', variables: ['c'], rows, truncated: true } satisfies QueryResult);
    mount();

    await clickRun();

    expect(container.querySelectorAll('tbody tr')).toHaveLength(MAX_ROWS_SHOWN);
    expect(status().textContent).toContain(`first ${MAX_ROWS_SHOWN}`);
    expect(status().textContent).toMatch(/more/);
  });

  it('shows the answer to an ASK query', async () => {
    run.mockResolvedValue({ kind: 'boolean', value: true } satisfies QueryResult);
    mount();

    await clickRun();

    expect(container.querySelector('[data-query-result]')?.textContent).toMatch(/true/);
  });

  it('shows the result of a CONSTRUCT query as Turtle text', async () => {
    run.mockResolvedValue({ kind: 'quads', quads: [quad(iri('A'), namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'), iri('B'))] } satisfies QueryResult);
    currentPrefixes = { ...prefixes, rdfs: 'http://www.w3.org/2000/01/rdf-schema#' };
    mount();

    await clickRun();

    expect(container.querySelector('pre')?.textContent).toContain(':A rdfs:subClassOf :B');
    expect(status().textContent).toMatch(/1 triple/);
  });

  it('shows the error of a query that fails, and can run again afterwards', async () => {
    run.mockRejectedValueOnce(new Error('Parse error on line 1')).mockResolvedValueOnce({ kind: 'boolean', value: false });
    mount();

    await clickRun();
    expect(error()?.textContent).toContain('Parse error on line 1');

    await clickRun();
    expect(error()).toBeNull();
    expect(container.querySelector('[data-query-result]')?.textContent).toMatch(/false/);
  });

  it('asks for an ontology instead of running when none is open', async () => {
    store = null;
    mount();

    await clickRun();

    expect(run).not.toHaveBeenCalled();
    expect(error()?.textContent).toMatch(/open an ontology/i);
  });

  it('runs with Ctrl+Enter in the editor', async () => {
    run.mockResolvedValue({ kind: 'boolean', value: true } satisfies QueryResult);
    mount();

    editor().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));

    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });

  it('does not run on a plain Enter', () => {
    mount();
    editor().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(run).not.toHaveBeenCalled();
  });

  it('shows what it renders as text, never as markup', async () => {
    run.mockResolvedValue({ kind: 'bindings', variables: ['x'], rows: [{ x: literal('<img src=x onerror=alert(1)>') }] } satisfies QueryResult);
    mount();

    await clickRun();

    expect(container.querySelector('tbody img')).toBeNull();
    expect(container.querySelector('tbody td')?.textContent).toContain('<img src=x');
  });

  describe('refresh, when another ontology is opened', () => {
    it('updates the prefixes of a query the user has not touched', () => {
      const tab = mount();
      currentPrefixes = { other: 'http://example.org/other#' };

      tab.refresh();

      expect(editor().value).toContain('PREFIX other: <http://example.org/other#>');
      expect(editor().value).not.toContain('PREFIX : <http://example.org/o#>');
    });

    it('leaves a query the user has edited alone', () => {
      const tab = mount();
      editor().value = 'SELECT * WHERE { ?s ?p ?o }';
      editor().dispatchEvent(new Event('input', { bubbles: true }));
      currentPrefixes = { other: 'http://example.org/other#' };

      tab.refresh();

      expect(editor().value).toBe('SELECT * WHERE { ?s ?p ?o }');
    });

    it('does nothing before the tab has been drawn', () => {
      const tab = createQueryTab({ getStore: () => store, getPrefixes: () => currentPrefixes, run: (...args) => run(...args) });
      expect(() => tab.refresh()).not.toThrow();
    });
  });
});
