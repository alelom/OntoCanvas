/**
 * Small canvas helpers (moved out of main.ts, #175): the edge shown for a triple, a faded colour, the edge whose label is
 * under a point, the lookup that resolves a term.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Network } from 'vis-network/esnext';
import { session } from '../../src/state/appState';
import { applyOpacityToColor, findShownEdge, getEdgeIdAtLabelPoint, getTermLookup } from '../../src/graph/canvasHelpers';
import type { GraphEdge } from '../../src/types';

const edge = (id: string, from: string, to: string, type: string): GraphEdge => ({ id, from, to, type }) as GraphEdge;

beforeEach(() => {
  session.rawData = { nodes: [], edges: [] };
  session.currentGraphDataForBuild = null;
  session.objectProperties = [];
  session.dataProperties = [];
});

describe('applyOpacityToColor', () => {
  it('turns a hex colour into rgba with the given opacity, with or without the #', () => {
    expect(applyOpacityToColor('#3498db', 0.65)).toBe('rgba(52, 152, 219, 0.65)');
    expect(applyOpacityToColor('2c3e50', 1)).toBe('rgba(44, 62, 80, 1)');
  });
});

describe('findShownEdge', () => {
  it('finds the edge in the loaded data', () => {
    const e = edge('1', 'A', 'B', 'knows');
    session.rawData = { nodes: [], edges: [e] };
    expect(findShownEdge('A', 'B', 'knows')).toBe(e);
  });

  it('falls back to an edge only the expanded graph draws, such as one to an imported class', () => {
    const drawn = edge('2', 'A', 'ext:C', 'hasPart');
    session.currentGraphDataForBuild = { nodes: [], edges: [drawn] };
    expect(findShownEdge('A', 'ext:C', 'hasPart')).toBe(drawn);
  });

  it('matches all three of from, to and type, and returns undefined otherwise', () => {
    session.rawData = { nodes: [], edges: [edge('1', 'A', 'B', 'knows')] };
    expect(findShownEdge('A', 'B', 'other')).toBeUndefined();
    expect(findShownEdge('B', 'A', 'knows')).toBeUndefined();
  });
});

describe('getEdgeIdAtLabelPoint', () => {
  const network = (edges: Record<string, unknown> | undefined) =>
    ({ body: { edges }, DOMtoCanvas: (p: { x: number; y: number }) => p }) as unknown as Network;
  const labelled = (left: number, top: number) => ({ options: { label: 'x' }, labelModule: { size: { left, top, width: 20, height: 10 } } });

  it('returns the id of the edge whose label box contains the point', () => {
    const net = network({ e1: labelled(0, 0), e2: labelled(100, 100) });
    expect(getEdgeIdAtLabelPoint(net, { x: 105, y: 105 })).toBe('e2');
  });

  it('returns null when no label is there, when an edge has no label, or when the network has no edges', () => {
    expect(getEdgeIdAtLabelPoint(network({ e1: labelled(0, 0) }), { x: 500, y: 500 })).toBeNull();
    expect(getEdgeIdAtLabelPoint(network({ e1: { options: {}, labelModule: { size: { left: 0, top: 0, width: 20, height: 10 } } } }), { x: 5, y: 5 })).toBeNull();
    expect(getEdgeIdAtLabelPoint(network(undefined), { x: 5, y: 5 })).toBeNull();
  });
});

describe('getTermLookup', () => {
  it('uses the expanded graph when there is one, else the loaded data', () => {
    session.rawData = { nodes: [{ id: 'local' } as never], edges: [] };
    expect(getTermLookup().nodes.map((n) => n.id)).toEqual(['local']);

    session.currentGraphDataForBuild = { nodes: [{ id: 'local' } as never, { id: 'external' } as never], edges: [] };
    expect(getTermLookup().nodes.map((n) => n.id)).toEqual(['local', 'external']);
  });
});
