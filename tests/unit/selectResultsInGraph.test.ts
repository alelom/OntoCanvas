/**
 * Showing a query result in the graph (#203): select the nodes and edges that are really drawn (a hidden edge or a
 * filtered-out node is skipped, vis-network would refuse an unknown id) and fit the view to them and the ends of the edges.
 */
import { describe, it, expect, vi } from 'vitest';
import { selectInGraph, type SelectableNetwork } from '../../src/graph/selectResults';

function fakeNetwork(nodes: string[], edges: Record<string, [string, string]>): SelectableNetwork & { setSelection: ReturnType<typeof vi.fn>; fit: ReturnType<typeof vi.fn> } {
  return {
    getPositions: (ids: string[]) => Object.fromEntries(ids.filter((id) => nodes.includes(id)).map((id) => [id, { x: 0, y: 0 }])),
    getConnectedNodes: (id: string) => edges[id] as never,
    setSelection: vi.fn(),
    fit: vi.fn(),
  } as never;
}

describe('selectInGraph', () => {
  it('selects the drawn nodes and edges, replacing the selection, and fits to them and the ends of the edges', () => {
    const net = fakeNetwork(['A', 'B', 'C'], { 'B->C:p': ['B', 'C'] });

    const done = selectInGraph(net, { nodeIds: ['A'], edgeIds: ['B->C:p'] });

    expect(net.setSelection).toHaveBeenCalledWith({ nodes: ['A'], edges: ['B->C:p'] }, { unselectAll: true, highlightEdges: false });
    expect(net.fit).toHaveBeenCalledWith({ nodes: ['A', 'B', 'C'], animation: true });
    expect(done).toEqual({ nodes: 1, edges: 1 });
  });

  it('skips what is not drawn, and says how many it selected', () => {
    const net = fakeNetwork(['A'], {});

    const done = selectInGraph(net, { nodeIds: ['A', 'Hidden'], edgeIds: ['A->Hidden:p'] });

    expect(net.setSelection).toHaveBeenCalledWith({ nodes: ['A'], edges: [] }, { unselectAll: true, highlightEdges: false });
    expect(done).toEqual({ nodes: 1, edges: 0 });
  });

  it('leaves the selection alone when none of it is drawn', () => {
    const net = fakeNetwork([], {});

    expect(selectInGraph(net, { nodeIds: ['Hidden'], edgeIds: [] })).toEqual({ nodes: 0, edges: 0 });
    expect(net.setSelection).not.toHaveBeenCalled();
    expect(net.fit).not.toHaveBeenCalled();
  });
});
