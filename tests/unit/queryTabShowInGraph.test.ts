// @vitest-environment jsdom
/**
 * "Show in graph" under a query result (#203): offered when the result names classes or relationships that are drawn,
 * it says what it will select, and a click hands exactly those to the graph.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Store, DataFactory } from 'n3';
import { createQueryTab } from '../../src/ui/sidePanel/queryTab';
import type { GraphIndex, GraphMatch } from '../../src/sparql/graphMatches';
import type { QueryResult } from '../../src/sparql/runQuery';

const NS = 'http://example.org/o#';
const { namedNode, literal } = DataFactory;

let container: HTMLElement;
let run: ReturnType<typeof vi.fn>;
let show: ReturnType<typeof vi.fn>;
let graph: GraphIndex | null;
const store = new Store();

const neverLoads = () => new Promise<never>(() => {});

const bindings = (variables: string[], rows: Record<string, unknown>[]): QueryResult =>
  ({ kind: 'bindings', variables, rows, truncated: false }) as unknown as QueryResult;

const mount = () => {
  const tab = createQueryTab({
    getStore: () => store,
    getPrefixes: () => ({ '': NS }),
    run: (...args) => run(...args),
    loadEditor: neverLoads,
    getGraph: () => graph,
    showInGraph: (match: GraphMatch) => show(match),
  });
  tab.render(container);
};

const runButton = () => container.querySelector<HTMLButtonElement>('[data-query-run]')!;
const showButton = () => container.querySelector<HTMLButtonElement>('[data-query-show-in-graph]');

async function runQuery(): Promise<void> {
  runButton().click();
  await vi.waitFor(() => expect(runButton().disabled).toBe(false));
}

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.append(container);
  run = vi.fn();
  show = vi.fn();
  graph = {
    nodes: [
      { id: 'Building', uri: NS + 'Building' },
      { id: 'Floor', uri: NS + 'Floor' },
    ],
    edges: [{ from: 'Building', to: 'Floor', type: 'hasFloor' }],
    objectProperties: [{ name: 'hasFloor', uri: NS + 'hasFloor' }],
  };
});

describe('Show in graph', () => {
  it('is offered for a result naming drawn classes, with what it will select', async () => {
    run.mockResolvedValue(bindings(['c'], [{ c: namedNode(NS + 'Building') }, { c: namedNode(NS + 'Floor') }, { c: namedNode(NS + 'hasFloor') }]));
    mount();

    await runQuery();

    expect(showButton()?.textContent).toContain('2 classes, 1 relationship');
  });

  it('hands exactly those nodes and edges to the graph when clicked', async () => {
    run.mockResolvedValue(bindings(['c'], [{ c: namedNode(NS + 'Floor') }, { c: namedNode(NS + 'hasFloor') }]));
    mount();
    await runQuery();

    showButton()!.click();

    expect(show).toHaveBeenCalledWith(expect.objectContaining({ nodeIds: ['Floor'], edgeIds: ['Building->Floor:hasFloor'] }));
  });

  it('is absent when the result names nothing that is drawn (an IRI the graph does not have, a count, a literal)', async () => {
    run.mockResolvedValue(bindings(['x', 'n'], [{ x: namedNode(NS + 'Unknown'), n: literal('3') }]));
    mount();

    await runQuery();

    expect(showButton()).toBeNull();
  });

  it('is absent without a graph to match against, and for a true/false result', async () => {
    graph = null;
    run.mockResolvedValue(bindings(['c'], [{ c: namedNode(NS + 'Building') }]));
    mount();
    await runQuery();
    expect(showButton()).toBeNull();

    graph = { nodes: [], edges: [], objectProperties: [] };
    run.mockResolvedValue({ kind: 'boolean', value: true });
    await runQuery();
    expect(showButton()).toBeNull();
  });

  it('goes away when the next query names nothing', async () => {
    run.mockResolvedValueOnce(bindings(['c'], [{ c: namedNode(NS + 'Building') }]));
    mount();
    await runQuery();
    expect(showButton()).not.toBeNull();

    run.mockResolvedValueOnce(bindings(['n'], [{ n: literal('1') }]));
    await runQuery();

    expect(showButton()).toBeNull();
  });
});

describe('Show in graph, a property with several edges (#204 review)', () => {
  beforeEach(() => {
    graph = {
      nodes: ['A', 'B', 'C'].map((id) => ({ id, uri: NS + id })),
      edges: [
        { from: 'B', to: 'A', type: 'subClassOf' },
        { from: 'C', to: 'A', type: 'subClassOf' },
      ],
      objectProperties: [],
    };
  });
  const SUBCLASS = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';

  it('selects the one edge of a row that names both its ends', async () => {
    run.mockResolvedValue(bindings(['s', 'p', 'o'], [{ s: namedNode(NS + 'B'), p: namedNode(SUBCLASS), o: namedNode(NS + 'A') }]));
    mount();
    await runQuery();

    showButton()!.click();

    expect(show.mock.calls[0][0].edgeIds).toEqual(['B->A:subClassOf']);
  });

  it('says in the title that a property alone selects every edge that uses it', async () => {
    run.mockResolvedValue(bindings(['p'], [{ p: namedNode(SUBCLASS) }]));
    mount();
    await runQuery();

    expect(showButton()!.textContent).toContain('2 relationships');
    expect(showButton()!.title).toContain('every edge that uses it');
  });

  it('does not say it when the rows name the ends', async () => {
    run.mockResolvedValue(bindings(['s', 'p', 'o'], [{ s: namedNode(NS + 'B'), p: namedNode(SUBCLASS), o: namedNode(NS + 'A') }]));
    mount();
    await runQuery();

    expect(showButton()!.title).not.toContain('every edge that uses it');
  });
});
