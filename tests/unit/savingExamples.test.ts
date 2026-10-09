import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Parser } from 'n3';
import { lineDiff } from './customSerializerTests/minimalDiff';
import {
  parseRdfToGraph,
  storeToTurtle,
  addDataPropertyRestrictionToClass,
  removeDataPropertyRestrictionFromClass,
  getDataPropertyRestrictionsForClass,
} from '../../src/parser';

const EXAMPLES = join(dirname(fileURLToPath(import.meta.url)), '../../examples');
const OWL = 'http://www.w3.org/2002/07/owl#';

/** The examples' header comments promise what the box shows and what Save writes; keep them true. */
describe('examples/saving', () => {
  it('data-restriction-cardinality.ttl: reads both forms, and the "Try it" edit saves the qualified form (#75)', async () => {
    const path = 'saving/data-restriction-cardinality.ttl';
    const original = readFileSync(join(EXAMPLES, path), 'utf-8');
    const { store, originalFileCache } = await parseRdfToGraph(original, { path });
    const card = (prop: string) => {
      const r = getDataPropertyRestrictionsForClass(store!, 'Book').find((x) => x.propertyName === prop)!;
      return [r.minCardinality ?? null, r.maxCardinality ?? null];
    };
    expect(card('title')).toEqual([1, null]);
    expect(card('isbn')).toEqual([1, 1]);

    // "Set Max to 3, press OK": what the Edit data property restriction dialog does.
    const range = getDataPropertyRestrictionsForClass(store!, 'Book').find((x) => x.propertyName === 'title')!.onDataRange;
    removeDataPropertyRestrictionFromClass(store!, 'Book', 'title');
    addDataPropertyRestrictionToClass(store!, 'Book', 'title', { minCardinality: 1, maxCardinality: 3 }, range);

    const saved = await storeToTurtle(store!, undefined, original, originalFileCache!, 'custom');
    const quads = new Parser().parse(saved);
    const titleBlank = quads.find((q) => q.predicate.value === OWL + 'onProperty' && q.object.value.endsWith('#title'))!.subject;
    const predicates = quads.filter((q) => q.subject.equals(titleBlank)).map((q) => q.predicate.value.replace(OWL, 'owl:'));
    expect(predicates).toEqual(expect.arrayContaining(['owl:onDataRange', 'owl:minQualifiedCardinality', 'owl:maxQualifiedCardinality']));
    expect(predicates).not.toContain('owl:minCardinality');

    // Only the title restriction's cardinality lines change; the list keeps its layout (#108).
    const d = lineDiff(original, saved);
    expect(d.removed).toEqual([expect.stringMatching(/^\s+owl:minCardinality "1"\^\^xsd:nonNegativeInteger \] ,$/)]);
    expect(d.added).toEqual([
      expect.stringMatching(/^\s+owl:minQualifiedCardinality "1"\^\^xsd:nonNegativeInteger ;$/),
      expect.stringMatching(/^\s+owl:maxQualifiedCardinality "3"\^\^xsd:nonNegativeInteger \] ,$/),
    ]);
  });

  it('undo-delete-class.ttl: the classes and relationships the "Try it" deletes and restores (#77)', async () => {
    const path = 'saving/undo-delete-class.ttl';
    const { graphData } = await parseRdfToGraph(readFileSync(join(EXAMPLES, path), 'utf-8'), { path });
    const edges = graphData.edges.map((e) => `${e.from}->${e.to}:${e.type}`).sort();
    expect(edges).toEqual(['Room->Wall:faces', 'Room->Wall:hasPart', 'Wall->Thing:subClassOf']);
    const wall = graphData.nodes.find((n) => n.id === 'Wall');
    expect(wall?.comment).toBe('A vertical element.');
    expect(wall?.dataPropertyRestrictions?.map((r) => r.propertyName)).toEqual(['title']);
  });
});
