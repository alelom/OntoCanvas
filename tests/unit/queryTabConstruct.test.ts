// @vitest-environment jsdom
/**
 * A CONSTRUCT or DESCRIBE result in the Query tab (#207): "Select in graph" for the edges and nodes its triples stand for, the
 * outline after the run, and how many of its triples are in the graph.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Store, DataFactory } from 'n3';
import { createQueryTab } from '../../src/ui/sidePanel/queryTab';
import type { GraphIndex, GraphMatch } from '../../src/sparql/graphMatches';
import type { QueryResult } from '../../src/sparql/runQuery';
import { decideShow, type ResultMatcher } from '../../src/graph/resultHighlight';

const NS = 'http://example.org/r#';
const STORE = new Store();
const { quad, namedNode } = DataFactory;
const I = (name: string) => `__individual__${NS}${name}`;

let container: HTMLElement;
const graph: GraphIndex = {
  nodes: [
    { id: 'TextReading', uri: NS + 'TextReading' },
    { id: I('reading2'), uri: NS + 'reading2', kind: 'individual' },
    { id: I('region1'), uri: NS + 'region1', kind: 'individual' },
    { id: I('region2'), uri: NS + 'region2', kind: 'individual' },
  ],
  edges: [{ id: '__individual_edge__0', from: I('reading2'), to: I('region1'), type: NS + 'isReadingOf', property: NS + 'isReadingOf' }],
  objectProperties: [],
};
const show = vi.fn();
const showResult = vi.fn((matcher: ResultMatcher) => decideShow(matcher(graph), graph));

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.append(container);
  show.mockReset();
  showResult.mockClear();
  localStorage.clear();
  createQueryTab({
    getStore: () => STORE,
    getPrefixes: () => ({ '': NS }),
    run: async () =>
      ({
        kind: 'quads',
        quads: [quad(namedNode(NS + 'reading2'), namedNode(NS + 'isReadingOf'), namedNode(NS + 'region1')), quad(namedNode(NS + 'x'), namedNode(NS + 'p'), namedNode(NS + 'y'))],
        truncated: false,
      }) as unknown as QueryResult,
    loadEditor: () => new Promise<never>(() => {}),
    getGraph: () => graph,
    showInGraph: (match: GraphMatch) => show(match),
    showResult,
    clearResult: () => {},
  }).render(container);
});

describe('a CONSTRUCT result', () => {
  it('offers to select the edge and nodes its triples stand for, outlines them, and says how many triples are in the graph', async () => {
    const run = container.querySelector<HTMLButtonElement>('[data-query-run]')!;
    run.click();
    await vi.waitFor(() => expect(run.disabled).toBe(false));

    const button = container.querySelector<HTMLButtonElement>('[data-query-show-in-graph]')!;
    expect(button.textContent).toBe('Select in graph (2 individuals, 1 relationship)');
    button.click();
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ edgeIds: ['__individual_edge__0'] }));

    expect(showResult).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-query-status]')!.textContent).toMatch(/^2 triples in \d+ ms; 1 of 2 are in the graph$/);
  });
});
