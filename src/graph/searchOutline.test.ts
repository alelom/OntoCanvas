import { describe, it, expect } from 'vitest';
import { outlineTargets, viewMatrix, outlineRect, polylinesOutsideBoxes, polylinePath, edgeSamplePoints } from './searchOutline';
import { computeSearchSets } from '../lib/searchHighlight';
import type { GraphEdge, GraphNode } from '../types';

const node = (id: string): GraphNode => ({ id, label: id, labellableRoot: null });
const edge = (from: string, to: string, type: string): GraphEdge => ({ from, to, type });

describe('outlineTargets: only what the search matched directly (#84)', () => {
  const nodes = [node('Group'), node('Agent'), node('Sheet')];
  const edges = [edge('Group', 'Agent', 'member')];
  const dataProperties = [{ name: 'paperSize', names: ['paperSize'], classIds: ['Sheet'] }];
  const run = (q: string) => outlineTargets(computeSearchSets(nodes, edges, q, true, false, { dataProperties }), q);

  it('a class search outlines the class, not its neighbours', () => {
    expect(run('Group')).toEqual({ nodeIds: ['Group'], dataPropertyNames: [], edgeIds: [] });
  });

  it('a relationship search outlines the relationship, not its two endpoints', () => {
    expect(run('member')).toEqual({ nodeIds: [], dataPropertyNames: [], edgeIds: ['Group->Agent:member'] });
  });

  it('a data-property search outlines its boxes, not the class they hang on', () => {
    expect(run('paperSize')).toEqual({ nodeIds: [], dataPropertyNames: ['paperSize'], edgeIds: [] });
  });

  it('no search, no outline', () => {
    expect(run('  ')).toEqual({ nodeIds: [], dataPropertyNames: [], edgeIds: [] });
  });
});

describe('viewMatrix: the graph view as an SVG transform', () => {
  it('derives scale and offset from where two graph points land on screen', () => {
    // Graph (0,0) → screen (100,50); graph (1,0) → screen (102,50): scale 2.
    expect(viewMatrix({ x: 100, y: 50 }, { x: 102, y: 50 })).toBe('matrix(2 0 0 2 100 50)');
  });
});

describe('outlineRect', () => {
  it('pads the node box on every side', () => {
    expect(outlineRect({ left: 10, top: 20, right: 50, bottom: 40 }, 4)).toEqual({ x: 6, y: 16, width: 48, height: 28 });
  });
});

describe('polylinesOutsideBoxes: the edge stroke, cut where it runs under boxes', () => {
  const line = Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 0 })); // x = 0..100
  it('drops points inside the end nodes, keeping the stretch between them', () => {
    const boxes = [
      { left: -5, top: -5, right: 15, bottom: 5 }, // from node: covers x 0..10
      { left: 85, top: -5, right: 105, bottom: 5 }, // to node: covers x 90..100
    ];
    expect(polylinesOutsideBoxes(line, boxes).map((run) => run.map((p) => p.x))).toEqual([[20, 30, 40, 50, 60, 70, 80]]);
  });

  it('splits around the label box into two runs', () => {
    const label = { left: 45, top: -5, right: 55, bottom: 5 }; // covers x = 50
    expect(polylinesOutsideBoxes(line, [label]).map((run) => [run[0].x, run[run.length - 1].x])).toEqual([
      [0, 40],
      [60, 100],
    ]);
  });

  it('drops single isolated points (nothing to stroke)', () => {
    const boxes = [{ left: 5, top: -5, right: 95, bottom: 5 }];
    expect(polylinesOutsideBoxes(line, boxes)).toEqual([]);
  });
});

describe('polylinePath', () => {
  it('writes an SVG path', () => {
    expect(polylinePath([{ x: 0, y: 0 }, { x: 10, y: 5.5 }])).toBe('M0 0 L10 5.5');
  });
});

describe('edgeSamplePoints: where a relationship is drawn', () => {
  it('samples an edge between two nodes along its curve', () => {
    const edgeType = { getPoint: (t: number) => ({ x: t * 100, y: 0 }) };
    expect(edgeSamplePoints({ fromId: 'A', toId: 'B', edgeType }, 4).map((p) => p.x)).toEqual([0, 25, 50, 75, 100]);
  });

  it('samples a self-loop (foaf:fundedBy on owl:Thing) around its circle, not at the node centre', () => {
    // vis draws a self-loop as a circle beside the node; its getPoint just returns the node centre.
    const edgeType = { getPoint: () => ({ x: 0, y: 0 }), _getCircleData: () => [100, 50, 20] as [number, number, number] };
    const pts = edgeSamplePoints({ fromId: 'Thing', toId: 'Thing', edgeType }, 4);
    expect(pts.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([[120, 50], [100, 30], [80, 50], [100, 70], [120, 50]]);
  });

  it('gives nothing when vis offers no geometry', () => {
    expect(edgeSamplePoints({ fromId: 'A', toId: 'A', edgeType: {} }, 4)).toEqual([]);
    expect(edgeSamplePoints({ fromId: 'A', toId: 'B' }, 4)).toEqual([]);
  });
});
