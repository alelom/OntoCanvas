/**
 * Unit tests for the relationship-aware hierarchical layouts (Hierarchical DAG /
 * tiers+spring / force-downward) and their shared layered model.
 *
 * The key property these pin down: ranking uses the full structural graph (object
 * properties + subClassOf/contains), so entity classes form a deep top-to-bottom flow
 * instead of collapsing into one row the way hierarchical00 (taxonomy-only) does.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/parser';
import { computeNodeDepths, estimateNodeDimensions } from '../../src/graph';
import { buildLayeredModel } from '../../src/layouts/layeredModel';
import { computeHierarchicalDag } from '../../src/layouts/hierarchicalDag';
import { computeHierarchicalTiersSpring } from '../../src/layouts/hierarchicalTiersSpring';
import { computeHierarchicalForceDownward } from '../../src/layouts/hierarchicalForceDownward';
import { computeLayoutQuality } from '../../src/layouts/layoutQuality';
import type { GraphEdge, GraphNode } from '../../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPACING = 220;

function buildDimensions(nodes: GraphNode[], depth: Record<string, number>, maxDepth: number) {
  const dims = new Map<string, { width: number; height: number }>();
  for (const n of nodes) {
    const d = depth[n.id] ?? 0;
    const fontSize = maxDepth > 0 ? Math.round(20 + ((70 - 20) * (maxDepth - d)) / maxDepth) : 70;
    dims.set(n.id, estimateNodeDimensions(n.label, 12, fontSize));
  }
  return dims;
}

async function load(file: string) {
  const path = join(__dirname, '../fixtures', file);
  const { graphData } = await parseRdfToGraph(readFileSync(path, 'utf-8'), { path });
  const nodeIds = new Set(graphData.nodes.map((n) => n.id));
  const { depth, maxDepth } = computeNodeDepths(nodeIds, graphData.edges);
  const dims = buildDimensions(graphData.nodes, depth, maxDepth);
  return { nodeIds, edges: graphData.edges as GraphEdge[], dims };
}

const MODES = [
  ['dag', computeHierarchicalDag],
  ['tiers-spring', computeHierarchicalTiersSpring],
  ['force-downward', computeHierarchicalForceDownward],
] as const;

describe('relationship-aware layered model', () => {
  it('ranks using object properties, producing deeper tiers than taxonomy-only', async () => {
    const { nodeIds, edges } = await load('uc01-merged-for-visualization.ttl');
    const { maxDepth: taxonomyDepth } = computeNodeDepths(nodeIds, edges);
    const model = buildLayeredModel(nodeIds, edges);
    // Taxonomy-only leveling tops out at 3; relationship-aware ranking goes deeper.
    expect(taxonomyDepth).toBeLessThanOrEqual(3);
    expect(model.maxLevel).toBeGreaterThan(taxonomyDepth);
  });

  it('parks disconnected components aside from the main flow', () => {
    const nodeIds = new Set(['A', 'B', 'C', 'Iso1', 'Iso2']);
    const edges: GraphEdge[] = [
      { from: 'B', to: 'A', type: 'subClassOf' }, // A is parent of B
      { from: 'C', to: 'A', type: 'subClassOf' }, // A is parent of C
      // Iso1, Iso2 have no edges -> disconnected singletons
    ];
    const model = buildLayeredModel(nodeIds, edges);
    expect([...model.mainNodes].sort()).toEqual(['A', 'B', 'C']);
    expect(model.parkedComponents.flat().sort()).toEqual(['Iso1', 'Iso2']);

    const dims = new Map(['A', 'B', 'C', 'Iso1', 'Iso2'].map((id) => [id, { width: 100, height: 40 }]));
    const pos = computeHierarchicalDag(nodeIds, edges, SPACING, dims);
    const mainMinX = Math.min(pos['A'].x, pos['B'].x, pos['C'].x);
    expect(pos['Iso1'].x).toBeLessThan(mainMinX);
    expect(pos['Iso2'].x).toBeLessThan(mainMinX);
    // A (root) sits above its subclasses B and C.
    expect(pos['A'].y).toBeLessThan(pos['B'].y);
    expect(pos['A'].y).toBeLessThan(pos['C'].y);
  });
});

describe('relationship-aware hierarchical layouts', () => {
  it('position every node exactly once with finite coordinates', async () => {
    for (const fx of ['uc01-merged-for-visualization.ttl', 'aec_drawing_metadata.ttl']) {
      const { nodeIds, edges, dims } = await load(fx);
      for (const [name, algo] of MODES) {
        const pos = algo(nodeIds, edges, SPACING, dims);
        expect(Object.keys(pos).length, `${name}/${fx}`).toBe(nodeIds.size);
        for (const id of nodeIds) {
          expect(Number.isFinite(pos[id]?.x), `${name}/${fx}/${id}.x`).toBe(true);
          expect(Number.isFinite(pos[id]?.y), `${name}/${fx}/${id}.y`).toBe(true);
        }
      }
    }
  });

  it('keep roots above leaves and stay reasonably balanced (not a ribbon)', async () => {
    const { nodeIds, edges, dims } = await load('uc01-merged-for-visualization.ttl');
    const model = buildLayeredModel(nodeIds, edges);
    const roots = model.mainNodes.filter((id) => model.level[id] === 0);
    const leaves = model.mainNodes.filter((id) => model.level[id] === model.maxLevel);
    for (const [name, algo] of MODES) {
      const pos = algo(nodeIds, edges, SPACING, dims);
      const avg = (ids: string[]) => ids.reduce((s, id) => s + pos[id].y, 0) / ids.length;
      expect(avg(roots), `${name} roots above leaves`).toBeLessThan(avg(leaves));
      const q = computeLayoutQuality(pos, dims, edges);
      console.log(`[${name}] aspect=${q.aspectRatio.toFixed(2)} spread=${q.spread.toFixed(1)} bbox=${Math.round(q.bboxWidth)}x${Math.round(q.bboxHeight)}`);
      expect(q.aspectRatio, `${name} aspect not a ribbon`).toBeLessThan(12);
    }
  });

  it('DAG and tiers-spring produce no overlaps within a tier', async () => {
    const { nodeIds, edges, dims } = await load('uc01-merged-for-visualization.ttl');
    for (const [name, algo] of [MODES[0], MODES[1]]) {
      const pos = algo(nodeIds, edges, SPACING, dims);
      const byY = new Map<number, string[]>();
      for (const id of nodeIds) {
        const y = Math.round(pos[id].y);
        if (!byY.has(y)) byY.set(y, []);
        byY.get(y)!.push(id);
      }
      for (const ids of byY.values()) {
        ids.sort((a, b) => pos[a].x - pos[b].x);
        for (let i = 1; i < ids.length; i++) {
          const minDist = dims.get(ids[i - 1])!.width / 2 + dims.get(ids[i])!.width / 2;
          expect(pos[ids[i]].x - pos[ids[i - 1]].x, `${name} overlap`).toBeGreaterThanOrEqual(minDist - 0.5);
        }
      }
    }
  });
});
