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
    expect(op!.members.sort()).toEqual(['Detail', 'Section']);
    expect(op!.range).toBe('OrientationValue');

    const dp = groups.find((g) => g.propertyName === 'scale');
    expect(dp).toBeTruthy();
    expect(dp!.propertyKind).toBe('data');
    expect(dp!.members.sort()).toEqual(['DrawingSheet', 'Layout']);
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
