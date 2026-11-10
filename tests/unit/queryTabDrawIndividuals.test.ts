// @vitest-environment jsdom
/**
 * "Select in graph" for a result naming individuals that are not drawn (#207, found reviewing #244): the button draws them,
 * within the limit, then selects all the result names. A query alone never draws them.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Store, DataFactory } from 'n3';
import { createQueryTab, type QueryTabDeps } from '../../src/ui/sidePanel/queryTab';
import type { GraphIndex, GraphMatch } from '../../src/sparql/graphMatches';
import type { QueryResult } from '../../src/sparql/runQuery';

const NS = 'http://example.org/r#';
const { namedNode } = DataFactory;
const STORE = new Store();
const I = (name: string) => `__individual__${NS}${name}`;

let container: HTMLElement;
let graph: GraphIndex;
let drawn: Set<string>;
let room: number;
const show = vi.fn();
const draw = vi.fn((iris: string[]) => {
  const adds = iris.filter((iri) => !drawn.has(iri)).slice(0, room);
  for (const iri of adds) {
    drawn.add(iri);
    graph = { ...graph, nodes: [...graph.nodes, { id: `__individual__${iri}`, uri: iri, kind: 'individual' }] };
  }
  return adds.length;
});

const result = (names: string[]): QueryResult =>
  ({ kind: 'bindings', variables: ['r'], rows: names.map((n) => ({ r: namedNode(NS + n) })), truncated: false }) as unknown as QueryResult;

function mount(names: string[]): void {
  const deps: QueryTabDeps = {
    getStore: () => STORE,
    getPrefixes: () => ({ '': NS }),
    run: async () => result(names),
    loadEditor: () => new Promise<never>(() => {}),
    getGraph: () => graph,
    showInGraph: (match: GraphMatch) => show(match),
    individuals: {
      isIndividual: (iri) => iri.startsWith(NS + 'reading'),
      isDrawn: (iri) => drawn.has(iri),
      draw,
      room: () => room,
      limit: 300,
    },
  };
  createQueryTab(deps).render(container);
}
const runButton = () => container.querySelector<HTMLButtonElement>('[data-query-run]')!;
const selectButton = () => container.querySelector<HTMLButtonElement>('[data-query-show-in-graph]');
async function runQuery(): Promise<void> {
  runButton().click();
  await vi.waitFor(() => expect(runButton().disabled).toBe(false));
}

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.append(container);
  show.mockReset();
  draw.mockClear();
  graph = { nodes: [{ id: 'TextReading', uri: NS + 'TextReading' }, { id: I('reading2'), uri: NS + 'reading2', kind: 'individual' }], edges: [], objectProperties: [] };
  drawn = new Set([NS + 'reading2']);
  room = 300;
});

describe('Select in graph, for individuals', () => {
  it('selects the drawn individuals a result names', async () => {
    mount(['reading2']);
    await runQuery();

    expect(selectButton()!.textContent).toBe('Select in graph (1 individual)');
    selectButton()!.click();

    expect(show).toHaveBeenCalledWith(expect.objectContaining({ nodeIds: [I('reading2')] }));
    expect(draw).not.toHaveBeenCalled();
  });

  it('is offered for individuals none of which are drawn, and the query alone draws nothing', async () => {
    drawn.clear();
    graph = { ...graph, nodes: graph.nodes.slice(0, 1) };
    mount(['reading2', 'reading4']);

    await runQuery();

    expect(selectButton()!.textContent).toBe('Select in graph (draws 2 individuals)');
    expect(draw).not.toHaveBeenCalled();
  });

  it('draws those not drawn, then selects every individual the result names', async () => {
    mount(['reading2', 'reading4', 'reading6']);
    await runQuery();
    expect(selectButton()!.textContent).toBe('Select in graph (1 individual, draws 2 more)');

    selectButton()!.click();

    expect(draw).toHaveBeenCalledWith([NS + 'reading4', NS + 'reading6']);
    await vi.waitFor(() => expect(show).toHaveBeenCalled());
    expect(show.mock.calls[0][0].nodeIds.sort()).toEqual([I('reading2'), I('reading4'), I('reading6')]);
  });

  it('draws only up to the limit, and says so', async () => {
    room = 1;
    mount(['reading2', 'reading4', 'reading6']);
    await runQuery();

    expect(selectButton()!.textContent).toBe('Select in graph (1 individual, draws 1 more of 2)');
    expect(selectButton()!.title).toContain('The graph draws up to 300 individuals');
  });

  it('says why nothing can be selected when none is drawn and there is no room', async () => {
    room = 0;
    drawn.clear();
    graph = { ...graph, nodes: graph.nodes.slice(0, 1) };
    mount(['reading2']);

    await runQuery();

    expect(selectButton()).toBeNull();
    expect(container.querySelector('[data-query-undrawn]')!.textContent).toBe('1 individual of the result is not drawn: the graph draws up to 300 individuals.');
  });
});
