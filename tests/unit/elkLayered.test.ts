/**
 * The "Layered (ELK)" layout (#153): ELK orders and places the nodes of each tier; the tiers themselves come from
 * the same layered model as the other hierarchical layouts (#151), so the Tiers setting and both rules apply.
 */
import { describe, it, expect } from 'vitest';
import { buildElkGraph, computeElkLayered } from '../../src/layouts/elkLayered';
import { buildLayeredModel } from '../../src/layouts/layeredModel';
import type { GraphEdge } from '../../src/types';

const sub = (child: string, parent: string): GraphEdge => ({ from: child, to: parent, type: 'subClassOf' });
const rel = (from: string, type: string, to: string): GraphEdge => ({ from, to, type });
const idsOf = (edges: GraphEdge[], extra: string[] = []) => new Set([...edges.flatMap((e) => [e.from, e.to]), ...extra]);
const dims = (ids: Set<string>) => new Map([...ids].map((id) => [id, { width: 100, height: 40 }]));
const CONTAINS = new Set(['subClassOf', 'contains']);

describe('the ELK graph built from the layered model', () => {
  const edges = [sub('A', 'P'), sub('B', 'P'), rel('A', 'contains', 'B'), rel('B', 'mentions', 'P')];
  const ids = idsOf(edges);

  it('has every node, its size, and its tier as a layer constraint', () => {
    const graph = buildElkGraph(ids, edges, 220, dims(ids), { hierarchyTypes: CONTAINS });
    const node = (id: string) => graph.children!.find((c) => c.id === id)!;
    expect(graph.children!.map((c) => c.id).sort()).toEqual(['A', 'B', 'P']);
    expect(node('A')).toMatchObject({ width: 100, height: 40 });
    expect(node('P').layoutOptions!['elk.layered.layering.layerChoiceConstraint']).toBe('0');
    expect(node('A').layoutOptions!['elk.layered.layering.layerChoiceConstraint']).toBe('1');
    expect(node('B').layoutOptions!['elk.layered.layering.layerChoiceConstraint']).toBe('2');
  });

  it('has the ranking edges downward, and the other relationships between tiers with a lower priority', () => {
    const graph = buildElkGraph(ids, edges, 220, dims(ids), { hierarchyTypes: CONTAINS });
    const pairs = graph.edges!.map((e) => `${e.sources[0]}>${e.targets[0]}:${e.layoutOptions?.['elk.layered.priority.straightness']}`);
    // B mentions P: drawn from P's tier down to B's, as a relationship that makes no tier.
    expect(pairs.sort()).toEqual(['A>B:10', 'P>A:10', 'P>B:1', 'P>B:10']);
  });
});

describe('computeElkLayered', () => {
  it('keeps the tiers of the layered model, parents above children, with no overlaps', async () => {
    const edges = [
      sub('A', 'P'), sub('B', 'P'), sub('C', 'P'), rel('A', 'contains', 'D'), rel('B', 'contains', 'E'),
      rel('C', 'contains', 'F'), sub('G', 'D'), sub('H', 'F'), rel('E', 'mentions', 'X'),
    ];
    const ids = idsOf(edges);
    const pos = await computeElkLayered(ids, edges, 220, dims(ids), { hierarchyTypes: CONTAINS });
    const { level } = buildLayeredModel(ids, edges, { hierarchyTypes: CONTAINS });
    for (const a of ids) {
      for (const b of ids) {
        if (level[a] === level[b]) {
          expect(pos[a].y, `${a} and ${b} share a tier`).toBeCloseTo(pos[b].y);
          if (a < b) expect(Math.abs(pos[a].x - pos[b].x), `${a} and ${b} overlap`).toBeGreaterThanOrEqual(100);
        } else if (level[a] < level[b]) {
          expect(pos[a].y, `${a} above ${b}`).toBeLessThan(pos[b].y);
        }
      }
    }
  });

  it('places a separate group too, below or beside the main one, without overlapping it', async () => {
    const edges = [sub('A', 'P'), sub('B', 'P'), sub('Y', 'X')];
    const ids = idsOf(edges, ['Lone']);
    const pos = await computeElkLayered(ids, edges, 220, dims(ids));
    expect(Object.keys(pos).sort()).toEqual(['A', 'B', 'Lone', 'P', 'X', 'Y']);
    const boxes = Object.entries(pos);
    for (const [a, p] of boxes) {
      for (const [b, q] of boxes) {
        if (a < b) expect(Math.abs(p.x - q.x) >= 100 || Math.abs(p.y - q.y) >= 40, `${a} and ${b} overlap`).toBe(true);
      }
    }
  });

  it('returns nothing for an empty graph', async () => {
    expect(await computeElkLayered(new Set(), [], 220)).toEqual({});
  });
});
