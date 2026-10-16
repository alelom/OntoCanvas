/**
 * "Tidy with forces" (#162): a short, mild relaxation that starts from a layout's positions. Overlapping classes are
 * pushed apart, excessively long relationships pulled shorter, and every node is held near where the layout put it.
 */
import { describe, it, expect } from 'vitest';
import { tidyWithForces, TIDY_MAX_DRIFT } from '../../src/layouts/forceTidy';
import { getLayoutAlgorithm } from '../../src/layouts';
import type { GraphEdge } from '../../src/types';

type Pos = Record<string, { x: number; y: number }>;
const box = { width: 100, height: 40 };
const size = () => box;
const rel = (from: string, to: string): GraphEdge => ({ from, to, type: 'subClassOf' });
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const overlapping = (pos: Pos, a: string, b: string) =>
  Math.abs(pos[a].x - pos[b].x) < box.width && Math.abs(pos[a].y - pos[b].y) < box.height;

describe('tidyWithForces', () => {
  it('pushes overlapping classes apart', () => {
    const start = { A: { x: 0, y: 0 }, B: { x: 30, y: 5 }, C: { x: 400, y: 0 } };
    const out = tidyWithForces(start, [], size);
    expect(overlapping(out, 'A', 'B')).toBe(false);
  });

  it('pulls an excessively long relationship shorter, and leaves the ordinary ones about as they were', () => {
    // A row of parents, each with a child 200 px below; one child sits 3,000 px away from its parent.
    const start: Pos = {};
    const edges: GraphEdge[] = [];
    for (let i = 0; i < 6; i++) {
      start[`P${i}`] = { x: i * 300, y: 0 };
      start[`C${i}`] = { x: i * 300, y: 200 };
      edges.push(rel(`C${i}`, `P${i}`));
    }
    start.C5 = { x: 4500, y: 200 };
    const out = tidyWithForces(start, edges, size);
    expect(dist(out.C5, out.P5)).toBeLessThan(dist(start.C5, start.P5) - 200);
    for (let i = 0; i < 5; i++) expect(Math.abs(dist(out[`C${i}`], out[`P${i}`]) - 200)).toBeLessThan(20);
  });

  it(`pulls no node further than ${TIDY_MAX_DRIFT} px along a relationship, and separates a crowded cluster`, () => {
    const start: Pos = { far: { x: 10000, y: 0 }, root: { x: 0, y: 0 } };
    const edges: GraphEdge[] = [rel('far', 'root')];
    for (let i = 0; i < 20; i++) {
      start[`n${i}`] = { x: (i % 5) * 20, y: Math.floor(i / 5) * 10 };
      edges.push(rel(`n${i}`, 'root'));
    }
    const out = tidyWithForces(start, edges, size);
    expect(dist(out.far, start.far)).toBeLessThanOrEqual(TIDY_MAX_DRIFT + 1e-6);
    const crowd = Object.keys(start).filter((id) => id.startsWith('n'));
    for (let i = 0; i < crowd.length; i++) {
      for (let j = i + 1; j < crowd.length; j++) expect(overlapping(out, crowd[i], crowd[j]), `${crowd[i]} / ${crowd[j]}`).toBe(false);
    }
  });

  it('moves the vertical position less than the horizontal one, so the tiers stay readable', () => {
    const start = { A: { x: 0, y: 0 }, B: { x: 0, y: 10 } };
    const out = tidyWithForces(start, [], size);
    expect(Math.abs(out.A.y - out.B.y)).toBeLessThan(Math.abs(out.A.x - out.B.x));
  });

  it('does not move the fixed nodes; the others keep clear of them', () => {
    const start = { Saved: { x: 0, y: 0 }, New: { x: 20, y: 0 } };
    const out = tidyWithForces(start, [], size, { fixed: new Set(['Saved']) });
    expect(out.Saved).toEqual(start.Saved);
    expect(overlapping(out, 'Saved', 'New')).toBe(false);
  });

  it('gives the same result for the same input', () => {
    const start = { A: { x: 0, y: 0 }, B: { x: 10, y: 0 }, C: { x: 5, y: 8 }, D: { x: 2000, y: 0 } };
    const edges = [rel('D', 'A'), rel('B', 'A')];
    expect(tidyWithForces(start, edges, size)).toEqual(tidyWithForces(start, edges, size));
  });

  it('returns an empty layout unchanged', () => {
    expect(tidyWithForces({}, [], size)).toEqual({});
  });
});

describe('the layouts with tidying on (#162)', () => {
  it('have no overlapping classes', () => {
    const edges: GraphEdge[] = [];
    for (let i = 0; i < 8; i++) edges.push(rel(`L${i}`, 'Left'), rel(`R${i}`, 'Right'));
    edges.push(rel('Left', 'Root'), rel('Right', 'Root'), rel('Mid', 'Left'), rel('Mid', 'Right'));
    const ids = new Set(edges.flatMap((e) => [e.from, e.to]));
    const dims = new Map([...ids].map((id) => [id, box]));
    for (const mode of ['hierarchical-dag', 'hierarchical-tiers-spring', 'hierarchical-force-downward']) {
      const pos = getLayoutAlgorithm(mode)!(ids, edges, 220, dims, { tidyForces: true });
      const list = [...ids];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) expect(overlapping(pos, list[i], list[j]), `${mode}: ${list[i]} / ${list[j]}`).toBe(false);
      }
    }
  });

  it('change nothing when tidying is off', () => {
    const edges = [rel('A', 'P'), rel('B', 'P')];
    const ids = new Set(['P', 'A', 'B']);
    const dag = getLayoutAlgorithm('hierarchical-dag')!;
    expect(dag(ids, edges, 220, undefined, { tidyForces: false })).toEqual(dag(ids, edges, 220));
  });
});
