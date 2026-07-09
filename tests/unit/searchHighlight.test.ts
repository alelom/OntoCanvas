/**
 * Unit tests for search-highlight opacity logic.
 *
 * Pins the fixed behaviour: with "include neighbours" OFF, edges that merely depart from a
 * matched node toward a non-matched node must be dimmed (not full opacity); neighbour
 * visibility only kicks in with "include neighbours" ON, and stops at the first ring.
 */
import { describe, it, expect } from 'vitest';
import {
  computeSearchSets,
  getNodeSearchOpacity,
  getEdgeSearchOpacity,
  OPACITY_MATCH,
  OPACITY_NEIGHBOR,
  OPACITY_DIM,
} from '../../src/lib/searchHighlight';
import { matchesSearch } from '../../src/graph';
import type { GraphEdge, GraphNode } from '../../src/types';

const node = (id: string, label = id): GraphNode => ({ id, label, labellableRoot: null });
const edge = (from: string, to: string, type: string): GraphEdge => ({ from, to, type });

// A --rel1--> B --rel3--> D --rel4--> E   and   A --rel2--> C
const NODES = ['A', 'B', 'C', 'D', 'E'].map((id) => node(id));
const EDGES = [
  edge('A', 'B', 'rel1'),
  edge('A', 'C', 'rel2'),
  edge('B', 'D', 'rel3'),
  edge('D', 'E', 'rel4'),
];

const nodeOp = (sets: ReturnType<typeof computeSearchSets>, id: string) =>
  getNodeSearchOpacity(id, sets.matchingNodeIds, sets.neighborNodeIds);
const edgeOp = (sets: ReturnType<typeof computeSearchSets>, e: GraphEdge, inc: boolean) =>
  getEdgeSearchOpacity(e.from, e.to, e.type, sets, inc);

describe('relationship search, include neighbours OFF', () => {
  const sets = computeSearchSets(NODES, EDGES, 'rel1', false);
  it('matches the relationship and its two endpoints only', () => {
    expect(sets.matchingNodeIds).toEqual(new Set(['A', 'B']));
    expect(sets.neighborNodeIds.size).toBe(0);
  });
  it('shows the matched edge at full opacity', () => {
    expect(edgeOp(sets, edge('A', 'B', 'rel1'), false)).toBe(OPACITY_MATCH);
  });
  it('dims OTHER edges departing from the matched nodes (the bug)', () => {
    expect(edgeOp(sets, edge('A', 'C', 'rel2'), false)).toBe(OPACITY_DIM);
    expect(edgeOp(sets, edge('B', 'D', 'rel3'), false)).toBe(OPACITY_DIM);
  });
  it('dims non-matched nodes', () => {
    expect(nodeOp(sets, 'A')).toBe(OPACITY_MATCH);
    expect(nodeOp(sets, 'B')).toBe(OPACITY_MATCH);
    expect(nodeOp(sets, 'C')).toBe(OPACITY_DIM);
    expect(nodeOp(sets, 'D')).toBe(OPACITY_DIM);
  });
});

describe('relationship search, include neighbours ON', () => {
  const sets = computeSearchSets(NODES, EDGES, 'rel1', true);
  it('collects only the first ring of neighbours', () => {
    expect(sets.neighborNodeIds).toEqual(new Set(['C', 'D'])); // C via A, D via B
    expect(sets.neighborNodeIds.has('E')).toBe(false); // second ring excluded
  });
  it('shows matched->neighbour edges dimmed-but-visible', () => {
    expect(edgeOp(sets, edge('A', 'C', 'rel2'), true)).toBe(OPACITY_NEIGHBOR);
    expect(edgeOp(sets, edge('B', 'D', 'rel3'), true)).toBe(OPACITY_NEIGHBOR);
  });
  it('stops at the first ring: neighbour->beyond edges/nodes are dimmed', () => {
    expect(edgeOp(sets, edge('D', 'E', 'rel4'), true)).toBe(OPACITY_DIM);
    expect(nodeOp(sets, 'E')).toBe(OPACITY_DIM);
    expect(nodeOp(sets, 'C')).toBe(OPACITY_NEIGHBOR);
    expect(nodeOp(sets, 'D')).toBe(OPACITY_NEIGHBOR);
  });
});

describe('node-name search behaves the same way', () => {
  it('OFF: only the node is highlighted, its edges dimmed', () => {
    const sets = computeSearchSets(NODES, EDGES, 'A', false);
    expect(sets.matchingNodeIds).toEqual(new Set(['A']));
    expect(edgeOp(sets, edge('A', 'B', 'rel1'), false)).toBe(OPACITY_DIM);
    expect(nodeOp(sets, 'B')).toBe(OPACITY_DIM);
  });
  it('ON: first-ring neighbours shown, second ring dimmed', () => {
    const sets = computeSearchSets(NODES, EDGES, 'A', true);
    expect(sets.neighborNodeIds).toEqual(new Set(['B', 'C']));
    expect(edgeOp(sets, edge('A', 'B', 'rel1'), true)).toBe(OPACITY_NEIGHBOR);
    expect(edgeOp(sets, edge('B', 'D', 'rel3'), true)).toBe(OPACITY_DIM);
  });
});

describe('other relationships between the two matched nodes', () => {
  // A and B are joined by hasRevision (searched) AND isRevisionOf (a second relationship).
  const nodes = ['A', 'B', 'C'].map((id) => node(id));
  const edges = [
    edge('A', 'B', 'hasRevision'),
    edge('B', 'A', 'isRevisionOf'),
    edge('A', 'C', 'rel2'),
  ];

  it('keeps the searched relationship full and dims the other one between the same nodes', () => {
    const sets = computeSearchSets(nodes, edges, 'hasRevision', false);
    // Both endpoints are matched (as relationship anchors), but neither matched by name.
    expect(sets.matchingNodeIds).toEqual(new Set(['A', 'B']));
    expect(sets.directNodeMatchIds.size).toBe(0);
    expect(edgeOp(sets, edge('A', 'B', 'hasRevision'), false)).toBe(OPACITY_MATCH); // searched
    expect(edgeOp(sets, edge('B', 'A', 'isRevisionOf'), false)).toBe(OPACITY_DIM); // other rel -> dimmed
    expect(edgeOp(sets, edge('A', 'C', 'rel2'), false)).toBe(OPACITY_DIM);
    // The two nodes themselves remain fully highlighted.
    expect(nodeOp(sets, 'A')).toBe(OPACITY_MATCH);
    expect(nodeOp(sets, 'B')).toBe(OPACITY_MATCH);
  });
});

describe('edge between two matched nodes', () => {
  it('is full opacity even without include neighbours', () => {
    // "al" matches labels Alpha and Alpha2 -> both A and B match as nodes.
    const nodes = [node('A', 'Alpha'), node('B', 'Alpha2'), node('C', 'Gamma')];
    const edges = [edge('A', 'B', 'rel1'), edge('A', 'C', 'rel2')];
    const sets = computeSearchSets(nodes, edges, 'alpha', false);
    expect(sets.matchingNodeIds).toEqual(new Set(['A', 'B']));
    expect(edgeOp(sets, edge('A', 'B', 'rel1'), false)).toBe(OPACITY_MATCH);
    expect(edgeOp(sets, edge('A', 'C', 'rel2'), false)).toBe(OPACITY_DIM);
  });
});

describe('exact match mode', () => {
  const nodes = ['A', 'B', 'C'].map((id) => node(id));
  // hasRevision (searched) vs hasRevisionTable (substring superset).
  const edges = [edge('A', 'B', 'hasRevision'), edge('A', 'C', 'hasRevisionTable')];

  it('substring mode matches the superset relationship too (the old behaviour)', () => {
    const sets = computeSearchSets(nodes, edges, 'hasRevision', false, false);
    expect(sets.matchingEdgeIds.has('A->B:hasRevision')).toBe(true);
    expect(sets.matchingEdgeIds.has('A->C:hasRevisionTable')).toBe(true);
  });

  it('exact mode matches only the whole-name relationship', () => {
    const sets = computeSearchSets(nodes, edges, 'hasRevision', false, true);
    expect(sets.matchingEdgeIds.has('A->B:hasRevision')).toBe(true);
    expect(sets.matchingEdgeIds.has('A->C:hasRevisionTable')).toBe(false);
    expect(sets.matchingNodeIds).toEqual(new Set(['A', 'B']));
  });

  it('exact mode matches a prefixed edge type by its local name or full type', () => {
    const uriEdges = [edge('A', 'B', 'https://ex.org/o#hasRevision')];
    expect(matchesSearch(null, uriEdges[0], 'hasRevision', true)).toBe(true); // local name
    expect(matchesSearch(null, uriEdges[0], 'https://ex.org/o#hasRevision', true)).toBe(true); // full
    expect(matchesSearch(null, uriEdges[0], 'hasRev', true)).toBe(false); // partial -> no
  });

  it('exact mode matches nodes by whole label/id, not substrings', () => {
    const n = node('DrawingSheet', 'Drawing Sheet');
    expect(matchesSearch(n, null, 'DrawingSheet', true)).toBe(true); // id
    expect(matchesSearch(n, null, 'Drawing Sheet', true)).toBe(true); // label
    expect(matchesSearch(n, null, 'Drawing', true)).toBe(false); // partial -> no
    expect(matchesSearch(n, null, 'Drawing', false)).toBe(true); // substring still works
  });
});

describe('empty query', () => {
  it('produces no highlight sets', () => {
    const sets = computeSearchSets(NODES, EDGES, '   ', true);
    expect(sets.matchingNodeIds.size).toBe(0);
    expect(sets.neighborNodeIds.size).toBe(0);
    expect(sets.matchingEdgeIds.size).toBe(0);
  });
});
