/**
 * A query result shown in the graph by itself (#207): when it is shown (something matched, not everything drawn, not too much),
 * what the view zooms to, and the highlight kept as a matcher, so it is matched again when the graph is redrawn.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  decideShow,
  nodesToFit,
  setResultHighlight,
  refreshResultHighlight,
  resultOutlineTargets,
  hasResultHighlight,
  onResultHighlightChange,
  RESULT_HIGHLIGHT_CAP,
} from '../../src/graph/resultHighlight';
import type { GraphIndex } from '../../src/sparql/graphMatches';

const graph: GraphIndex = {
  nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
  edges: [
    { from: 'A', to: 'B', type: 'p' },
    { id: '__individual_edge__0', from: 'B', to: 'C', type: 'q' },
  ],
  objectProperties: [],
};

beforeEach(() => setResultHighlight(null, null));

describe('decideShow', () => {
  it('shows a match that is part of what is drawn', () => {
    expect(decideShow({ nodeIds: ['A'], edgeIds: [] }, graph)).toEqual({ kind: 'show', nodes: 1, edges: 0 });
  });

  it('does not show nothing, nor everything drawn: there would be nothing to single out', () => {
    expect(decideShow({ nodeIds: [], edgeIds: [] }, graph)).toEqual({ kind: 'none' });
    expect(decideShow({ nodeIds: ['A', 'B', 'C'], edgeIds: [] }, graph)).toEqual({ kind: 'everything' });
  });

  it(`does not show more than ${RESULT_HIGHLIGHT_CAP} nodes and edges, and says how many matched`, () => {
    const many = Array.from({ length: RESULT_HIGHLIGHT_CAP + 1 }, (_, i) => `n${i}`);
    const big: GraphIndex = { ...graph, nodes: [...many.map((id) => ({ id })), { id: 'other' }] };

    expect(decideShow({ nodeIds: many, edgeIds: [] }, big)).toEqual({ kind: 'tooMany', count: RESULT_HIGHLIGHT_CAP + 1 });
  });
});

describe('nodesToFit', () => {
  it('is the matched nodes and the ends of the matched edges, each once', () => {
    expect(nodesToFit({ nodeIds: ['A'], edgeIds: ['A->B:p', '__individual_edge__0'] }, graph).sort()).toEqual(['A', 'B', 'C']);
  });
});

describe('the highlight', () => {
  it('is the matcher, matched against the graph; again on every redraw', () => {
    const matcher = vi.fn((g: GraphIndex) => ({ nodeIds: g.nodes.slice(0, 1).map((n) => n.id), edgeIds: ['__individual_edge__0'] }));

    setResultHighlight(matcher, graph);
    expect(resultOutlineTargets()).toEqual({ nodeIds: ['A'], dataPropertyNames: [], edgeIds: ['__individual_edge__0'] });

    refreshResultHighlight({ ...graph, nodes: [{ id: 'Z' }, ...graph.nodes] });
    expect(resultOutlineTargets().nodeIds).toEqual(['Z']);
    expect(hasResultHighlight()).toBe(true);
  });

  it('is cleared, and tells its listeners', () => {
    const listener = vi.fn();
    onResultHighlightChange(listener);
    setResultHighlight(() => ({ nodeIds: ['A'], edgeIds: [] }), graph);

    setResultHighlight(null, null);

    expect(resultOutlineTargets()).toEqual({ nodeIds: [], dataPropertyNames: [], edgeIds: [] });
    expect(hasResultHighlight()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
