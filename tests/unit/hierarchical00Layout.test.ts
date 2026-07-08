/**
 * Unit tests for the Hierarchical 00 layered layout and the layout-quality measure.
 *
 * Background: hierarchical01/02/03 re-lay-out a node's subtree once per parent, so on
 * the DAG-shaped ontologies we actually load the horizontal extent is multiplied many
 * times over, producing an extreme wide "ribbon" (aspect ratio ~100:1) that forces the
 * viewport to zoom far out. Hierarchical 00 places every node exactly once on a single
 * level and packs each level tightly. These tests pin that fix in place by comparing the
 * distribution quality of H00 against the legacy modes on real fixtures.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/parser';
import { computeNodeDepths, estimateNodeDimensions, resolveOverlaps } from '../../src/graph';
import { computeHierarchical00 } from '../../src/layouts/hierarchical00';
import { computeHierarchical01 } from '../../src/layouts/hierarchical01';
import { computeHierarchical02 } from '../../src/layouts/hierarchical02';
import { computeHierarchical03 } from '../../src/layouts/hierarchical03';
import { computeLayoutQuality } from '../../src/layouts/layoutQuality';
import type { GraphEdge, GraphNode } from '../../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPACING = 220;

/** Build node dimensions exactly as main.ts does: font size scaled by depth (min 20, max 70). */
function buildDimensions(nodes: GraphNode[], depth: Record<string, number>, maxDepth: number) {
  const dims = new Map<string, { width: number; height: number }>();
  for (const n of nodes) {
    const d = depth[n.id] ?? 0;
    const fontSize =
      maxDepth > 0
        ? Math.round(20 + ((70 - 20) * (maxDepth - d)) / maxDepth)
        : 70;
    dims.set(n.id, estimateNodeDimensions(n.label, 12, fontSize));
  }
  return dims;
}

interface Loaded {
  nodeIds: Set<string>;
  edges: GraphEdge[];
  nodes: GraphNode[];
  dims: Map<string, { width: number; height: number }>;
  depth: Record<string, number>;
  maxDepth: number;
}

async function loadFixture(file: string): Promise<Loaded> {
  const path = join(__dirname, '../fixtures', file);
  const content = readFileSync(path, 'utf-8');
  const { graphData } = await parseRdfToGraph(content, { path });
  const nodeIds = new Set(graphData.nodes.map((n) => n.id));
  const { depth, maxDepth } = computeNodeDepths(nodeIds, graphData.edges);
  const dims = buildDimensions(graphData.nodes, depth, maxDepth);
  return { nodeIds, edges: graphData.edges, nodes: graphData.nodes, dims, depth, maxDepth };
}

describe('computeLayoutQuality', () => {
  it('reports a high aspect ratio / spread for a wide ribbon and low for a square block', () => {
    const dims = new Map([
      ['a', { width: 100, height: 40 }],
      ['b', { width: 100, height: 40 }],
      ['c', { width: 100, height: 40 }],
      ['d', { width: 100, height: 40 }],
    ]);
    // Ribbon: all four in a single far-apart row.
    const ribbon = { a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, c: { x: 2000, y: 0 }, d: { x: 3000, y: 0 } };
    // Compact 2x2 block, tightly packed.
    const block = { a: { x: 0, y: 0 }, b: { x: 110, y: 0 }, c: { x: 0, y: 50 }, d: { x: 110, y: 50 } };
    const qRibbon = computeLayoutQuality(ribbon, dims, []);
    const qBlock = computeLayoutQuality(block, dims, []);
    expect(qRibbon.aspectRatio).toBeGreaterThan(qBlock.aspectRatio);
    expect(qRibbon.spread).toBeGreaterThan(qBlock.spread);
    expect(qBlock.imbalance).toBeLessThan(qRibbon.imbalance);
  });
});

describe('Hierarchical 00 layered layout', () => {
  const fixtures = [
    'uc01-merged-for-visualization.ttl',
    'aec_drawing_metadata.ttl',
    'simple-object-property.ttl',
  ];

  it('positions every node exactly once with finite coordinates', async () => {
    for (const fx of fixtures) {
      const { nodeIds, edges, dims } = await loadFixture(fx);
      const pos = computeHierarchical00(nodeIds, edges, SPACING, dims);
      expect(Object.keys(pos).length).toBe(nodeIds.size);
      for (const id of nodeIds) {
        expect(pos[id]).toBeDefined();
        expect(Number.isFinite(pos[id].x)).toBe(true);
        expect(Number.isFinite(pos[id].y)).toBe(true);
      }
    }
  });

  it('places roots above leaves (smaller y = higher on screen)', async () => {
    for (const fx of fixtures) {
      const { nodeIds, edges, dims, depth, maxDepth } = await loadFixture(fx);
      if (maxDepth === 0) continue; // flat graph (e.g. simple-object-property): no hierarchy
      const pos = computeHierarchical00(nodeIds, edges, SPACING, dims);
      const rootYs: number[] = [];
      const leafYs: number[] = [];
      for (const id of nodeIds) {
        if ((depth[id] ?? 0) === 0) rootYs.push(pos[id].y);
        if ((depth[id] ?? 0) === maxDepth) leafYs.push(pos[id].y);
      }
      const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
      expect(avg(rootYs)).toBeLessThan(avg(leafYs));
    }
  });

  it('produces no overlapping nodes within the same level', async () => {
    for (const fx of fixtures) {
      const { nodeIds, edges, dims } = await loadFixture(fx);
      const pos = computeHierarchical00(nodeIds, edges, SPACING, dims);
      // Group by y (each level shares exactly one y).
      const byY = new Map<number, string[]>();
      for (const id of nodeIds) {
        const y = pos[id].y;
        if (!byY.has(y)) byY.set(y, []);
        byY.get(y)!.push(id);
      }
      for (const ids of byY.values()) {
        ids.sort((a, b) => pos[a].x - pos[b].x);
        for (let i = 1; i < ids.length; i++) {
          const prev = ids[i - 1], cur = ids[i];
          const minDist = dims.get(prev)!.width / 2 + dims.get(cur)!.width / 2;
          const dist = pos[cur].x - pos[prev].x;
          expect(dist).toBeGreaterThanOrEqual(minDist - 0.5);
        }
      }
    }
  });

  it('is dramatically more compact than hierarchical01/02/03 on DAG ontologies', async () => {
    for (const fx of ['uc01-merged-for-visualization.ttl', 'aec_drawing_metadata.ttl']) {
      const { nodeIds, edges, dims } = await loadFixture(fx);

      // App-faithful pipeline: legacy modes run resolveOverlaps after the layout
      // (this is where the catastrophic root-separation ribbon comes from); H00
      // skips it because it is already overlap-free and tightly packed.
      const withOverlaps = (algo: typeof computeHierarchical01) =>
        computeLayoutQuality(
          resolveOverlaps(algo(nodeIds, edges, SPACING, dims), nodeIds, edges, dims, { minPadding: 8 }),
          dims, edges
        );
      const q00 = computeLayoutQuality(computeHierarchical00(nodeIds, edges, SPACING, dims), dims, edges);
      const q01 = withOverlaps(computeHierarchical01);
      const q02 = withOverlaps(computeHierarchical02);
      const q03 = withOverlaps(computeHierarchical03);
      // Algorithm-level comparison (no resolveOverlaps on either side).
      const q03raw = computeLayoutQuality(computeHierarchical03(nodeIds, edges, SPACING, dims), dims, edges);

      console.log(`[${fx}] aspect H00=${q00.aspectRatio.toFixed(1)} H01=${q01.aspectRatio.toFixed(1)} H02=${q02.aspectRatio.toFixed(1)} H03=${q03.aspectRatio.toFixed(1)} H03raw=${q03raw.aspectRatio.toFixed(1)} | spread H00=${q00.spread.toFixed(1)} H03=${q03.spread.toFixed(1)}`);

      // The legacy default (hierarchical03 + resolveOverlaps) is an extreme ribbon.
      expect(q03.aspectRatio).toBeGreaterThan(40);
      // H00 must be far more balanced.
      expect(q00.aspectRatio).toBeLessThan(15);
      // ...and beat every legacy mode on both aspect ratio and spread.
      for (const legacy of [q01, q02, q03]) {
        expect(q00.aspectRatio).toBeLessThan(legacy.aspectRatio * 0.5);
        expect(q00.spread).toBeLessThan(legacy.spread);
      }
      // It also beats the raw legacy algorithm (independent of resolveOverlaps).
      expect(q00.aspectRatio).toBeLessThan(q03raw.aspectRatio);
      // Hierarchy edges should be far shorter (less "exaggerated distance").
      expect(q00.avgEdgeLenPerDiag).toBeLessThan(q03.avgEdgeLenPerDiag);
    }
  });
});
