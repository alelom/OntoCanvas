/**
 * Stacking many leaf children under their parent (#159): the children of one parent that have no children of their
 * own form a block of several columns, instead of one long row. Any tiered layout is wrapped: each block is laid out
 * as one node of the grid's size, then expanded into its grid.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { findLeafBlocks, blockShape, withLeafBlocks, withLeafBlocksAsync, LEAF_BLOCK_THRESHOLD } from '../../src/layouts/leafBlocks';
import { buildLayeredModel } from '../../src/layouts/layeredModel';
import { computeHierarchicalDag } from '../../src/layouts/hierarchicalDag';
import { computeHierarchicalTiersSpring } from '../../src/layouts/hierarchicalTiersSpring';
import { computeElkLayered } from '../../src/layouts/elkLayered';
import { parseRdfToGraph } from '../../src/parser';
import { definitionParents } from '../../src/lib/definitionParents';
import type { GraphEdge } from '../../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sub = (child: string, parent: string): GraphEdge => ({ from: child, to: parent, type: 'subClassOf' });
const leaves = (parent: string, n: number) => Array.from({ length: n }, (_, i) => `${parent}${String(i).padStart(2, '0')}`);
const box = { width: 100, height: 40 };
const dims = (ids: Iterable<string>) => new Map([...ids].map((id) => [id, box]));

/** Root has P (12 leaves) and Q (1 leaf). */
const broad = () => {
  const edges = [sub('P', 'Root'), sub('Q', 'Root'), sub('Q00', 'Q'), ...leaves('P', 12).map((l) => sub(l, 'P'))];
  const ids = new Set(edges.flatMap((e) => [e.from, e.to]));
  return { edges, ids };
};

const width = (pos: Record<string, { x: number; y: number }>) => {
  const xs = Object.values(pos).map((p) => p.x);
  return Math.max(...xs) - Math.min(...xs);
};
const expectNoOverlaps = (pos: Record<string, { x: number; y: number }>) => {
  const ids = Object.keys(pos);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const [a, b] = [pos[ids[i]], pos[ids[j]]];
      const apart = Math.abs(a.x - b.x) >= box.width - 0.5 || Math.abs(a.y - b.y) >= box.height - 0.5;
      expect(apart, `${ids[i]} and ${ids[j]} overlap`).toBe(true);
    }
  }
};

describe('findLeafBlocks', () => {
  it(`groups ${LEAF_BLOCK_THRESHOLD} or more leaf children of one parent, in order`, () => {
    const { edges, ids } = broad();
    expect(findLeafBlocks(buildLayeredModel(ids, edges))).toEqual([{ parent: 'P', members: leaves('P', 12) }]);
  });

  it('leaves out a child that has children, and a leaf with a second parent', () => {
    const edges = [...leaves('P', 6).map((l) => sub(l, 'P')), sub('Deep', 'P00'), sub('P01', 'Other')];
    const ids = new Set(edges.flatMap((e) => [e.from, e.to]));
    // P00 has a child and P01 a second parent: 4 leaves are left, below the threshold.
    expect(findLeafBlocks(buildLayeredModel(ids, edges))).toEqual([]);
  });

  it('makes no block below the threshold', () => {
    const edges = leaves('P', LEAF_BLOCK_THRESHOLD - 1).map((l) => sub(l, 'P'));
    expect(findLeafBlocks(buildLayeredModel(new Set(edges.flatMap((e) => [e.from, e.to])), edges))).toEqual([]);
  });
});

describe('blockShape', () => {
  it('picks the number of columns that makes the block closest to square, and fills it row by row', () => {
    const members = leaves('P', 9);
    const shape = blockShape(members, () => box);
    // 2 columns: 240 × 320 px; 3 columns would be 380 × 180.
    expect(shape.columns).toBe(2);
    expect(shape.width).toBe(240);
    expect(shape.height).toBe(320);
    expect(shape.offsets.P00).toEqual({ dx: -70, dy: -140 });
    expect(shape.offsets.P01).toEqual({ dx: 70, dy: -140 });
    expect(shape.offsets.P08).toEqual({ dx: -70, dy: 140 });
  });

  it('sizes its cells by the widest and tallest member', () => {
    const shape = blockShape(['a', 'b'], (id) => (id === 'a' ? { width: 200, height: 40 } : { width: 50, height: 90 }));
    expect(shape.columns).toBe(1);
    expect(shape.width).toBe(200);
    expect(shape.height).toBe(90 * 2 + 30);
  });
});

describe('withLeafBlocks', () => {
  const stacked = withLeafBlocks(computeHierarchicalDag);

  it('stacks the leaves in a block below their parent: narrower, no overlaps', () => {
    const { edges, ids } = broad();
    const rows = computeHierarchicalDag(ids, edges, 220, dims(ids));
    const pos = stacked(ids, edges, 220, dims(ids), { stackLeaves: true });
    expect(Object.keys(pos).sort()).toEqual([...ids].sort());
    expect(width(pos)).toBeLessThan(width(rows) / 2);
    for (const l of leaves('P', 12)) expect(pos[l].y).toBeGreaterThan(pos.P.y);
    expect(new Set(leaves('P', 12).map((l) => Math.round(pos[l].x))).size).toBeGreaterThan(1);
    expectNoOverlaps(pos);
  });

  it('centres the block under its parent', () => {
    const { edges, ids } = broad();
    const pos = stacked(ids, edges, 220, dims(ids), { stackLeaves: true });
    const xs = leaves('P', 12).map((l) => pos[l].x);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(pos.P.x, 0);
  });

  it('lays out as before when stacking is off', () => {
    const { edges, ids } = broad();
    expect(stacked(ids, edges, 220, dims(ids), { stackLeaves: false })).toEqual(computeHierarchicalDag(ids, edges, 220, dims(ids)));
  });

  it('wraps the other tiered layouts the same way', () => {
    const { edges, ids } = broad();
    const pos = withLeafBlocks(computeHierarchicalTiersSpring)(ids, edges, 220, dims(ids), { stackLeaves: true });
    expect(width(pos)).toBeLessThan(width(computeHierarchicalTiersSpring(ids, edges, 220, dims(ids))) / 2);
    expectNoOverlaps(pos);
  });

  it('wraps the asynchronous ELK layout', async () => {
    const { edges, ids } = broad();
    const rows = await computeElkLayered(ids, edges, 220, dims(ids));
    const pos = await withLeafBlocksAsync(computeElkLayered)(ids, edges, 220, dims(ids), { stackLeaves: true });
    expect(width(pos)).toBeLessThan(width(rows) / 2);
    expectNoOverlaps(pos);
  });
});

describe('examples/layout/broad-menu.ttl (#159)', () => {
  it('stacks Dish, Vegetable and Cheese, and leaves Meat and Spice in rows', async () => {
    const path = join(__dirname, '../../examples/layout/broad-menu.ttl');
    const { graphData, store } = await parseRdfToGraph(readFileSync(path, 'utf-8'), { path });
    const ids = new Set(graphData.nodes.map((n) => n.id));
    // Dish's 14 dishes and its 3 defined classes (#160).
    const model = buildLayeredModel(ids, graphData.edges, { definitions: definitionParents(store, ids) });
    expect(findLeafBlocks(model).map((b) => [b.parent, b.members.length])).toEqual([['Cheese', 6], ['Dish', 17], ['Vegetable', 8]]);
  });
});
