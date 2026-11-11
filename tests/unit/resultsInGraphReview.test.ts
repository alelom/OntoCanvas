// @vitest-environment jsdom
/**
 * The review of #244: the SHACL report says what its "Show in graph" did; a result's outline goes when the individuals drawn
 * change (it would match something else); and the outline line says when it comes from the first rows of a result only.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Parser, Store, DataFactory } from 'n3';
import { createChecksTab } from '../../src/ui/sidePanel/checksTab';
import { createChecksLibrary } from '../../src/checks/checksLibrary';
import { initSidePanel } from '../../src/ui/sidePanel/initSidePanel';
import { createDataSources } from '../../src/sparql/dataSources';
import { createIndividualsLayer } from '../../src/abox/individualsLayer';
import { createQueryTab } from '../../src/ui/sidePanel/queryTab';
import { decideShow, type ResultMatcher } from '../../src/graph/resultHighlight';
import type { GraphIndex } from '../../src/sparql/graphMatches';
import type { QueryResult } from '../../src/sparql/runQuery';
import { MAX_ROWS_SHOWN } from '../../src/sparql/resultView';

const NS = 'http://example.org/d#';
const store = (ttl: string) => new Store(new Parser().parse(`@prefix : <${NS}> . @prefix sh: <http://www.w3.org/ns/shacl#> .\n${ttl}`));

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('the SHACL report says what "Show in graph" did (#244 review)', () => {
  it('outlined, and how many the limit left out', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const library = createChecksLibrary();
    const showInGraph = vi.fn(async () => ({ decision: { kind: 'show' as const, nodes: 2, edges: 0 }, notDrawn: 3, limit: 300 }));
    createChecksTab({ library, getStores: () => [store(':r1 a :R . :r2 a :R .')], getPrefixes: () => ({ '': NS }), showInGraph }).render(container);
    await library.addFiles([{ path: 's.shacl.ttl', text: async () => '@prefix sh: <http://www.w3.org/ns/shacl#> . @prefix : <http://example.org/d#> . :S a sh:NodeShape ; sh:targetClass :R ; sh:property [ sh:path :p ; sh:minCount 1 ] .' }]);
    container.querySelector<HTMLButtonElement>('[data-checks-run]')!.click();
    await vi.waitFor(() => expect(container.querySelector('[data-checks-show-all]')).not.toBeNull(), { timeout: 5000 });

    container.querySelector<HTMLButtonElement>('[data-checks-show-all]')!.click();

    await vi.waitFor(() => expect(container.querySelector('[data-checks-shown]')!.textContent).toBe('2 focus nodes outlined in the graph. 3 not drawn: the graph draws up to 300 individuals.'));
  });

  it('says why nothing moved: everything drawn, too many, or none drawn', async () => {
    const { focusShownText } = await import('../../src/ui/sidePanel/checksTab');

    expect(focusShownText({ decision: { kind: 'everything' }, notDrawn: 0, limit: 300 })).toBe('These focus nodes are all that is drawn: there is nothing to single out.');
    expect(focusShownText({ decision: { kind: 'tooMany', count: 640 }, notDrawn: 0, limit: 300 })).toBe('640 matches in the graph: too many to outline.');
    expect(focusShownText({ decision: { kind: 'none' }, notDrawn: 4, limit: 300 })).toBe('None of these focus nodes is drawn. 4 not drawn: the graph draws up to 300 individuals.');
  });
});

describe('a result outline goes when the individuals drawn change (#244 review)', () => {
  it('drawing or clearing individuals clears it, so it never outlines what the result did not name', () => {
    document.body.innerHTML = '<div id="networkWrapper"></div><aside id="sidePanel"></aside>';
    const ontology = store(':room1 a :Room . :room2 a :Room .');
    const layer = createIndividualsLayer({ autoMax: 0, getStores: () => [ontology] });
    const clearResult = vi.fn();
    initSidePanel({ getStore: () => ontology, getPrefixes: () => ({}), dataSources: createDataSources(), individualsLayer: layer, clearResult, embedded: false });

    layer.show(NS + 'room1');
    layer.clear();

    expect(clearResult).toHaveBeenCalledTimes(2);
  });

  it("the Query tab's line goes when the outline is cleared from elsewhere", async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const graph: GraphIndex = { nodes: [{ id: 'A', uri: NS + 'a' }, { id: 'B', uri: NS + 'b' }], edges: [], objectProperties: [] };
    const listeners: (() => void)[] = [];
    let shown = false;
    createQueryTab({
      getStore: () => ontologyStore,
      getPrefixes: () => ({}),
      run: async () => ({ kind: 'bindings', variables: ['x'], rows: [{ x: DataFactory.namedNode(NS + 'a') }], truncated: false }) as unknown as QueryResult,
      loadEditor: () => new Promise<never>(() => {}),
      getGraph: () => graph,
      showInGraph: () => {},
      showResult: (matcher: ResultMatcher) => ((shown = true), decideShow(matcher(graph), graph)),
      clearResult: () => (shown = false),
      onResultChange: (listener) => listeners.push(listener),
      hasResult: () => shown,
    }).render(container);
    const run = container.querySelector<HTMLButtonElement>('[data-query-run]')!;
    run.click();
    await vi.waitFor(() => expect(container.querySelector('[data-query-shown]')).not.toBeNull());

    shown = false;
    listeners.forEach((listener) => listener());

    expect(container.querySelector('[data-query-shown]')).toBeNull();
  });
});
const ontologyStore = new Store();

describe('the outline line of a result read only in part (#244 review)', () => {
  it(`says the outline comes from the first ${MAX_ROWS_SHOWN} rows`, async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const graph: GraphIndex = { nodes: [{ id: 'A', uri: NS + 'a' }, { id: 'B', uri: NS + 'b' }], edges: [], objectProperties: [] };
    createQueryTab({
      getStore: () => ontologyStore,
      getPrefixes: () => ({}),
      run: async () => ({ kind: 'bindings', variables: ['x'], rows: [{ x: DataFactory.namedNode(NS + 'a') }], truncated: true }) as unknown as QueryResult,
      loadEditor: () => new Promise<never>(() => {}),
      getGraph: () => graph,
      showInGraph: () => {},
      showResult: (matcher: ResultMatcher) => decideShow(matcher(graph), graph),
      clearResult: () => {},
    }).render(container);

    container.querySelector<HTMLButtonElement>('[data-query-run]')!.click();

    await vi.waitFor(() => expect(container.querySelector('[data-query-shown]')!.textContent).toBe(`1 class outlined in the graph (from the first ${MAX_ROWS_SHOWN} rows). Clear`));
  });
});
