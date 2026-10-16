/**
 * Pins what the examples under examples/layout/ promise in their header comments.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/parser';
import { buildLayeredModel } from '../../src/layouts/layeredModel';

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
