/**
 * Pins what the examples under examples/layout/ promise in their header comments.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/parser';
import { buildLayeredModel } from '../../src/layouts/layeredModel';
import { getLayoutAlgorithm } from '../../src/layouts';
import { estimateNodeDimensions } from '../../src/graph';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = join(__dirname, '../../examples/layout');

describe('examples/layout/hierarchy-tiers.ttl (#151)', () => {
  const load = async () => {
    const path = join(dir, 'hierarchy-tiers.ttl');
    const { graphData } = await parseRdfToGraph(readFileSync(path, 'utf-8'), { path });
    const config = JSON.parse(readFileSync(join(dir, 'hierarchy-tiers.display.json'), 'utf-8'));
    const label = (id: string) => graphData.nodes.find((n) => n.id === id)!.label;
    const tiersWith = (types: string[]) => {
      const { level } = buildLayeredModel(new Set(graphData.nodes.map((n) => n.id)), graphData.edges, {
        hierarchyTypes: new Set(types),
      });
      const tiers: string[][] = [];
      for (const [id, t] of Object.entries(level)) (tiers[t] = tiers[t] || []).push(label(id));
      return tiers.map((t) => t.sort());
    };
    return { config, tiersWith };
  };

  it('has the tiers its comment lists, with its display config', async () => {
    const { config, tiersWith } = await load();
    expect(tiersWith(config.hierarchyRelationships)).toEqual([
      ['Page'],
      ['Author', 'Format', 'Page element'],
      ['A4', 'Figure', 'Footnote', 'Header', 'Letter'],
      ['Diagram', 'Logo', 'Photo'],
    ]);
  });

  it('puts Page element on top, beside Page, with contains unticked', async () => {
    const { tiersWith } = await load();
    expect(tiersWith(['subClassOf'])[0]).toEqual(expect.arrayContaining(['Page', 'Page element']));
  });
});

describe('examples/layout/tidy-forces.ttl (#162)', () => {
  it('keeps the arrangement but shortens the long refers-to line, with no overlaps, with its display config', async () => {
    const path = join(dir, 'tidy-forces.ttl');
    const { graphData } = await parseRdfToGraph(readFileSync(path, 'utf-8'), { path });
    const config = JSON.parse(readFileSync(join(dir, 'tidy-forces.display.json'), 'utf-8'));
    const ids = new Set(graphData.nodes.map((n) => n.id));
    const dims = new Map(graphData.nodes.map((n) => [n.id, estimateNodeDimensions(n.label, 12, 30)]));
    const dag = getLayoutAlgorithm('hierarchical-dag')!;
    const plain = dag(ids, graphData.edges, 220, dims, { stackLeaves: true });
    const tidied = dag(ids, graphData.edges, 220, dims, { stackLeaves: true, tidyForces: config.tidyForces });
    const link = (p: Record<string, { x: number; y: number }>) => Math.hypot(p.Archive.x - p.Map.x, p.Archive.y - p.Map.y);
    expect(link(tidied)).toBeLessThan(link(plain) - 50);
    // Library's and Museum's children stay on their side.
    expect(tidied.Archive.x).toBeLessThan(tidied.Map.x);
    const list = [...ids];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = [list[i], list[j]];
        const apart = Math.abs(tidied[a].x - tidied[b].x) >= (dims.get(a)!.width + dims.get(b)!.width) / 2 ||
          Math.abs(tidied[a].y - tidied[b].y) >= (dims.get(a)!.height + dims.get(b)!.height) / 2;
        expect(apart, `${a} / ${b}`).toBe(true);
      }
    }
  });
});
