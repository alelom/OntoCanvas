import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/parser';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');

describe('union-domain class expression groups (#59)', () => {
  it('surfaces owl:unionOf domains for object and data properties', async () => {
    const ttl = readFileSync(join(FIXTURES, 'unionDomain.ttl'), 'utf-8');
    const r = await parseRdfToGraph(ttl, { path: 'unionDomain.ttl' });
    const groups = r.graphData.classExpressions ?? [];

    const op = groups.find((g) => g.propertyName === 'hasOrientation');
    expect(op).toBeTruthy();
    expect(op!.operator).toBe('union');
    expect(op!.propertyKind).toBe('object');
    expect(op!.position).toBe('domain');
    expect(op!.members.sort()).toEqual(['Detail', 'Section']);
    expect(op!.counterparts).toEqual(['OrientationValue']);

    const dp = groups.find((g) => g.propertyName === 'scale');
    expect(dp).toBeTruthy();
    expect(dp!.propertyKind).toBe('data');
    expect(dp!.members.sort()).toEqual(['DrawingSheet', 'Layout']);
  });

  it('surfaces an owl:unionOf range on an object property as a range-position group', async () => {
    const ttl = `@prefix : <http://example.org/o#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/o> a owl:Ontology .
:Room a owl:Class ; rdfs:label "Room" .
:Wall a owl:Class ; rdfs:label "Wall" .
:Floor a owl:Class ; rdfs:label "Floor" .
:hasPart a owl:ObjectProperty ;
  rdfs:domain :Room ;
  rdfs:range [ a owl:Class ; owl:unionOf ( :Wall :Floor ) ] .`;
    const r = await parseRdfToGraph(ttl, { path: 'range.ttl' });
    const groups = r.graphData.classExpressions ?? [];
    const g = groups.find((x) => x.propertyName === 'hasPart');
    expect(g).toBeTruthy();
    expect(g!.position).toBe('range');
    expect(g!.propertyKind).toBe('object');
    expect(g!.members.sort()).toEqual(['Floor', 'Wall']);
    expect(g!.counterparts).toEqual(['Room']);

    // The range union is flattened into one edge per member so both relationships are visible.
    const edges = r.graphData.edges.filter((e) => e.from === 'Room' && (e.to === 'Wall' || e.to === 'Floor'));
    expect(edges.map((e) => e.to).sort()).toEqual(['Floor', 'Wall']);
  });

  it('does not emit groups for plain single-class domains', async () => {
    const ttl = `@prefix : <http://example.org/o#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/o> a owl:Ontology .
:A a owl:Class ; rdfs:label "A" .
:B a owl:Class ; rdfs:label "B" .
:p a owl:ObjectProperty ; rdfs:domain :A ; rdfs:range :B .`;
    const r = await parseRdfToGraph(ttl, { path: 'x.ttl' });
    expect(r.graphData.classExpressions ?? []).toHaveLength(0);
  });
});
