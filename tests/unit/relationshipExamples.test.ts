import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/parser';
import { getPropertyHasCardinality } from '../../src/ui/relationshipUtils';

const EXAMPLES = join(dirname(fileURLToPath(import.meta.url)), '../../examples/relationships');

/** The hand-testing examples for relationships must keep showing what their header comments promise. */
describe('examples/relationships', () => {
  it('one-edge-type-per-property.ttl: each property is one relationship type, listed once (#87)', async () => {
    const file = 'one-edge-type-per-property.ttl';
    const r = await parseRdfToGraph(readFileSync(join(EXAMPLES, file), 'utf-8'), { path: file });
    const typesOf = (property: string) =>
      [...new Set(r.graphData.edges.filter((e) => e.type.replace(/.*[#/]/, '') === property).map((e) => e.type))];
    expect(typesOf('worksFor')).toEqual(['worksFor']);
    expect(typesOf('manages')).toEqual(['manages']);
    const pairs = r.graphData.edges.filter((e) => e.type !== 'subClassOf').map((e) => `${e.from}->${e.to}:${e.type}`).sort();
    expect(pairs).toEqual(['Employee->Organisation:worksFor', 'Manager->Department:manages', 'Manager->Team:manages']);
    // The menu's entries are the property names: the same keys, once each.
    const names = r.objectProperties.map((op) => op.name);
    expect(names.filter((n) => n.endsWith('worksFor') || n.endsWith('manages')).sort()).toEqual(['manages', 'worksFor']);
  });

  it('add-relationship-then-ok.ttl: two unconnected classes and one commented, cardinality-capable type (#98)', async () => {
    const file = 'add-relationship-then-ok.ttl';
    const r = await parseRdfToGraph(readFileSync(join(EXAMPLES, file), 'utf-8'), { path: file });
    expect(r.graphData.nodes.map((n) => n.label).sort()).toEqual(['Author', 'Book']);
    expect(r.graphData.edges).toEqual([]);
    // "wri" matches this one type only, so the dialog fills it in; its comment and cardinality are what appear.
    expect(r.objectProperties).toHaveLength(1);
    const [writes] = r.objectProperties;
    expect(writes.label).toBe('writes');
    expect(writes.comment).toMatch(/^Links an author to a book/);
    expect(getPropertyHasCardinality(writes.name, r.objectProperties, null)).toBe(true);
  });
});
