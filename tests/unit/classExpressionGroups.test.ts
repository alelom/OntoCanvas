import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/parser';
import type { ClassExpressionGroup } from '../../src/types';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');

/**
 * Class expressions beyond owl:unionOf in rdfs:domain / rdfs:range: intersection (#60),
 * complement (#61) and enumeration (#62). They are surfaced as ClassExpressionGroups and drawn with
 * the same overlay mechanism as unions (#59).
 */
describe('class expression groups: intersection / complement / oneOf (#60, #61, #62)', async () => {
  const ttl = readFileSync(join(FIXTURES, 'classExpressions.ttl'), 'utf-8');
  const r = await parseRdfToGraph(ttl, { path: 'classExpressions.ttl' });
  const groups = r.graphData.classExpressions ?? [];
  const byProp = (name: string): ClassExpressionGroup | undefined => groups.find((g) => g.propertyName === name);
  // Edge types are full URIs for properties outside the default base.
  const edgesOf = (name: string) => r.graphData.edges.filter((e) => e.type === name || e.type.endsWith(`#${name}`));

  it('#60 surfaces an owl:intersectionOf object-property domain and flattens it to one edge per operand', () => {
    const g = byProp('hasRevision');
    expect(g).toMatchObject({ operator: 'intersection', position: 'domain', propertyKind: 'object', counterparts: ['Revision'] });
    expect(g!.members.sort()).toEqual(['Approved', 'Drawing']);
    expect(edgesOf('hasRevision').map((e) => `${e.from}->${e.to}`).sort()).toEqual(['Approved->Revision', 'Drawing->Revision']);
  });

  it('#60 surfaces an owl:intersectionOf data-property domain, badging both operand stubs', () => {
    const g = byProp('approvalCode');
    expect(g).toMatchObject({ operator: 'intersection', position: 'domain', propertyKind: 'data' });
    expect(g!.members.sort()).toEqual(['Approved', 'Drawing']);
    const dp = r.dataProperties.find((d) => d.name === 'approvalCode');
    expect(dp?.domains.sort()).toEqual(['Approved', 'Drawing']);
  });

  it('#61 surfaces an owl:complementOf object-property range as a single-member group with one edge', () => {
    const g = byProp('supersedes');
    expect(g).toMatchObject({ operator: 'complement', position: 'range', propertyKind: 'object', counterparts: ['Sheet'], members: ['Draft'] });
    expect(edgesOf('supersedes').map((e) => `${e.from}->${e.to}`)).toEqual(['Sheet->Draft']);
  });

  it('#61 surfaces an owl:complementOf data-property domain on the complemented class stub', () => {
    const g = byProp('issueDate');
    expect(g).toMatchObject({ operator: 'complement', position: 'domain', propertyKind: 'data', members: ['Draft'] });
  });

  it('#62 surfaces an owl:oneOf of typed individuals, anchored on their class', () => {
    const g = byProp('hasOrientation');
    expect(g).toMatchObject({ operator: 'oneOf', position: 'range', propertyKind: 'object', counterparts: ['Sheet'], members: ['Orientation'] });
    expect(g!.values).toEqual(['Portrait', 'Landscape']);
    // The individuals are not added as nodes; the relationship is drawn to their class.
    expect(r.graphData.nodes.some((n) => n.id === 'Portrait')).toBe(false);
    expect(edgesOf('hasOrientation').map((e) => `${e.from}->${e.to}`)).toEqual(['Sheet->Orientation']);
  });

  it('#62 surfaces an owl:oneOf of untyped individuals with no anchor class (marker on the counterpart)', () => {
    const g = byProp('hasStatus');
    expect(g).toMatchObject({ operator: 'oneOf', position: 'range', propertyKind: 'object', counterparts: ['Drawing'], members: [] });
    expect(g!.values).toEqual(['Current', 'Superseded']);
    expect(edgesOf('hasStatus')).toHaveLength(0);
  });

  it('#62 surfaces a datatype owl:oneOf of literals on the domain class stub', () => {
    const g = byProp('paperSize');
    expect(g).toMatchObject({ operator: 'oneOf', position: 'range', propertyKind: 'data', members: [], counterparts: ['Sheet'] });
    expect(g!.values).toEqual(['A0', 'A1', 'A3']);
  });

  it('resolves counterparts through an expression on the other end (union domain + oneOf range)', async () => {
    const ttl = readFileSync(join(FIXTURES, '../../examples/class-expressions/all-class-expressions.ttl'), 'utf-8');
    const all = (await parseRdfToGraph(ttl, { path: 'all.ttl' })).graphData.classExpressions ?? [];
    const union = all.find((x) => x.propertyName === 'hasOrientation' && x.operator === 'union');
    const oneOf = all.find((x) => x.propertyName === 'hasOrientation' && x.operator === 'oneOf');
    expect(union?.counterparts).toEqual(['Orientation']);
    expect(oneOf?.counterparts).toEqual(['Section', 'Detail']);
  });

  it('keeps the existing union groups unchanged (no values noise)', async () => {
    const u = await parseRdfToGraph(readFileSync(join(FIXTURES, 'unionDomain.ttl'), 'utf-8'), { path: 'u.ttl' });
    const op = (u.graphData.classExpressions ?? []).find((g) => g.propertyName === 'hasOrientation');
    expect(op).toMatchObject({ operator: 'union', position: 'domain' });
    expect(op!.values).toBeUndefined();
  });
});

describe('class expressions whose edge cannot be drawn (FOAF made: domain Agent, range ¬Agent)', async () => {
  const ttl = `@prefix : <http://example.org/o#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/o> a owl:Ontology .
:Agent a owl:Class .
:A a owl:Class .
:B a owl:Class .
:made a owl:ObjectProperty ; rdfs:domain :Agent ; rdfs:range [ a owl:Class ; owl:complementOf :Agent ] .
:tagged a owl:ObjectProperty ; rdfs:domain [ a owl:Class ; owl:unionOf ( :A :B ) ] .`;
  const r = await parseRdfToGraph(ttl, { path: 'made.ttl' });
  const groups = r.graphData.classExpressions ?? [];

  it('keeps the group even though its only edge would be a self-loop (not drawn)', () => {
    const made = groups.find((x) => x.propertyName === 'made');
    expect(made).toMatchObject({ operator: 'complement', position: 'range', members: ['Agent'], counterparts: ['Agent'] });
    expect(r.graphData.edges.some((e) => e.from === 'Agent' && e.to === 'Agent' && e.type.endsWith('made'))).toBe(false);
  });

  it('keeps a domain expression with no range (no other end)', () => {
    const tagged = groups.find((x) => x.propertyName === 'tagged');
    expect(tagged).toMatchObject({ operator: 'union', position: 'domain', counterparts: [] });
    expect(tagged!.members.sort()).toEqual(['A', 'B']);
  });
});

describe('review fixes: literal display and multiple domain/range triples', async () => {
  const ttl = `@prefix : <http://example.org/o#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<http://example.org/o> a owl:Ontology .
:Thing2 a owl:Class .
:A a owl:Class .
:B a owl:Class .
:R a owl:Class .
:code a owl:DatatypeProperty ; rdfs:domain :Thing2 ;
  rdfs:range [ a rdfs:Datatype ; owl:oneOf ( "1" "1"^^xsd:integer "hello"@en "plain" ) ] .
:linked a owl:ObjectProperty ;
  rdfs:domain :Thing2 , [ a owl:Class ; owl:unionOf ( :A :B ) ] ;
  rdfs:range :R .`;
  const r = await parseRdfToGraph(ttl, { path: 'review.ttl' });
  const groups = r.graphData.classExpressions ?? [];

  it('keeps literal datatypes and language tags so values stay distinguishable', () => {
    const g = groups.find((x) => x.propertyName === 'code');
    expect(g?.values).toEqual(['1', '"1"^^xsd:integer', '"hello"@en', 'plain']);
  });

  it('finds an expression among several rdfs:domain triples, not only the first', () => {
    const g = groups.find((x) => x.propertyName === 'linked');
    expect(g).toMatchObject({ operator: 'union', position: 'domain', counterparts: ['R'] });
    expect(g!.members.sort()).toEqual(['A', 'B']);
  });
});

describe('nested class expressions (#63)', async () => {
  const ttl = `@prefix : <http://example.org/nx#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<http://example.org/nx> a owl:Ontology .
:Person a owl:Class . :Agent a owl:Class . :OnlineAccount a owl:Class . :Employee a owl:Class .
:Badge a owl:Class . :Project a owl:Class . :A a owl:Class . :B a owl:Class . :C a owl:Class . :D a owl:Class .
:currentProject a owl:ObjectProperty ; rdfs:domain :Person ;
  rdfs:range [ a owl:Class ; owl:complementOf [ a owl:Class ; owl:unionOf ( :Agent :OnlineAccount ) ] ] .
:worksOn a owl:ObjectProperty ; rdfs:range :Project ;
  rdfs:domain [ a owl:Class ; owl:intersectionOf ( :Employee [ a owl:Restriction ; owl:onProperty :hasBadge ; owl:someValuesFrom :Badge ] ) ] .
:linked a owl:ObjectProperty ; rdfs:range :D ;
  rdfs:domain [ a owl:Class ; owl:unionOf ( :A [ a owl:Class ; owl:unionOf ( :B :C ) ] ) ] .
:limited a owl:ObjectProperty ; rdfs:range :D ;
  rdfs:domain [ a owl:Class ; owl:intersectionOf ( :A
    [ a owl:Restriction ; owl:onProperty :p ; owl:allValuesFrom [ a owl:Class ; owl:unionOf ( :B :C ) ] ]
    [ a owl:Restriction ; owl:onProperty :q ; owl:minQualifiedCardinality "2"^^xsd:nonNegativeInteger ; owl:onClass :B ]
    [ a owl:Restriction ; owl:onProperty :r ; owl:hasSelf true ] ) ] .
:hasBadge a owl:ObjectProperty . :p a owl:ObjectProperty . :q a owl:ObjectProperty . :r a owl:ObjectProperty .`;
  const r = await parseRdfToGraph(ttl, { path: 'nested.ttl' });
  const groups = r.graphData.classExpressions ?? [];
  const byProp = (name: string) => groups.find((g) => g.propertyName === name);

  it('a complement of a union is drawn against the union\'s classes, with the full formula', () => {
    const g = byProp('currentProject');
    expect(g).toMatchObject({ operator: 'complement', position: 'range', counterparts: ['Person'], formula: '¬(Agent ∪ OnlineAccount)', nested: true });
    expect(g!.members.sort()).toEqual(['Agent', 'OnlineAccount']);
  });

  it('an intersection with a restriction operand is drawn against its named class only', () => {
    const g = byProp('worksOn');
    expect(g).toMatchObject({ operator: 'intersection', members: ['Employee'], formula: 'Employee ∩ ∃hasBadge.Badge', nested: true });
  });

  it('nested unions collect every named class, parenthesising the inner one', () => {
    const g = byProp('linked');
    expect(g?.members.sort()).toEqual(['A', 'B', 'C']);
    expect(g?.formula).toBe('A ∪ (B ∪ C)');
  });

  it('writes ∀, qualified cardinality and Self restrictions in DL notation', () => {
    expect(byProp('limited')?.formula).toBe('A ∩ ∀p.(B ∪ C) ∩ ≥2 q.B ∩ ∃r.Self');
  });

  it('flat expressions are marked not nested, with a plain formula', () => {
    const u = groups.find((g) => g.propertyName === 'linked');
    expect(u?.nested).toBe(true);
    const flat = (r.graphData.classExpressions ?? []).filter((g) => !g.nested);
    expect(flat).toHaveLength(0); // every expression in this fixture is nested
  });
});
