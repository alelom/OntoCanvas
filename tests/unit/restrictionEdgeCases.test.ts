import { describe, it, expect } from 'vitest';
import type { Store } from 'n3';
import { parseRdfToGraph, removeRestrictionEdgeFromStore, getDataProperties } from '../../src/parser';
import { describeDataRange } from '../../src/rdf/dataRanges';
import { resolveExpressionClassUris, type RdfTerm } from '../../src/rdf/classExpressions';
import { describeRange } from '../../src/lib/dataPropertyDisplay';

/** OWL edge cases raised in the review of PR #74 (#63): shared blank nodes, classes outside the main
 * namespace, owl:hasSelf false, enumerations nested in expressions, nested data ranges. */

const PREFIXES = `@prefix : <http://example.org/ec#> .
@prefix ext: <http://example.org/external#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<http://example.org/ec> a owl:Ontology .
`;
const EC = 'http://example.org/ec#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';

const load = async (ttl: string) => parseRdfToGraph(PREFIXES + ttl, { path: 'ec.ttl' });
const orphans = (store: Store) =>
  store.getQuads(null, null, null, null).filter((q) => q.subject.termType === 'BlankNode' && store.getQuads(null, null, q.subject, null).length === 0);

describe('removing a restriction edge', () => {
  it('keeps a restriction shared with another class until its last reference goes', async () => {
    const { store } = await load(`:Wall a owl:Class . :Room a owl:Class . :Hall a owl:Class .
:hasPart a owl:ObjectProperty .
_:r a owl:Restriction ; owl:onProperty :hasPart ; owl:allValuesFrom :Wall .
:Room rdfs:subClassOf _:r .
:Hall rdfs:subClassOf _:r .`);
    expect(removeRestrictionEdgeFromStore(store, 'Room', 'Wall', 'hasPart')).toBe(1);
    const hallLinks = store.getQuads(EC + 'Hall', RDFS + 'subClassOf', null, null);
    expect(hallLinks).toHaveLength(1);
    expect(store.getQuads(hallLinks[0].object, null, null, null)).toHaveLength(3); // type, onProperty, filler
    expect(removeRestrictionEdgeFromStore(store, 'Hall', 'Wall', 'hasPart')).toBe(1);
    expect(store.getQuads(null, null, null, null).filter((q) => q.subject.termType === 'BlankNode')).toHaveLength(0);
  });

  it('finds a restriction whose filler class is declared outside the main namespace', async () => {
    const { store } = await load(`ext:Wall a owl:Class . :Room a owl:Class .
:hasPart a owl:ObjectProperty .
:Room rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :hasPart ; owl:allValuesFrom ext:Wall ] .`);
    expect(removeRestrictionEdgeFromStore(store, 'Room', 'Wall', 'hasPart')).toBe(1);
    expect(orphans(store)).toHaveLength(0);
  });
});

describe('owl:hasSelf is a self restriction only when true', () => {
  const ttl = `:Person a owl:Class ; rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :knows ; owl:hasSelf "false"^^xsd:boolean ] .
:Agent a owl:Class ; rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :knows ; owl:hasSelf true ] .
:Team a owl:Class .
:knows a owl:ObjectProperty .
:likes a owl:ObjectProperty ; rdfs:range :Team ;
  rdfs:domain [ a owl:Class ; owl:intersectionOf ( :Person [ a owl:Restriction ; owl:onProperty :knows ; owl:hasSelf false ] ) ] .`;

  it('draws no ⟲ loop for hasSelf false, and still draws one for true', async () => {
    const r = await load(ttl);
    const loops = r.graphData.edges.filter((e) => e.from === e.to && e.type === 'knows').map((e) => e.from);
    expect(loops).toEqual(['Agent']);
  });

  it('does not write hasSelf false as ∃p.Self in a nested formula', async () => {
    const r = await load(ttl);
    const g = (r.graphData.classExpressions ?? []).find((x) => x.propertyName === 'likes');
    expect(g?.formula ?? '').not.toContain('Self');
  });
});

describe('an enumeration nested in a class expression', () => {
  it("is drawn against its individuals' classes, like a top-level one", async () => {
    const r = await load(`:Section a owl:Class . :Orientation a owl:Class .
:portrait a owl:NamedIndividual , :Orientation .
:hasPart a owl:ObjectProperty ; rdfs:range [ a owl:Class ; owl:unionOf ( :Section [ a owl:Class ; owl:oneOf ( :portrait ) ] ) ] .`);
    const store = r.store as unknown as Store;
    const range = store.getQuads(EC + 'hasPart', RDFS + 'range', null, null)[0].object as RdfTerm;
    expect(resolveExpressionClassUris(store, range)).toEqual([EC + 'Section', EC + 'Orientation']);
  });
});

describe('nested data ranges', () => {
  const ttl = `:Thing a owl:Class .
:notWord a owl:DatatypeProperty ; rdfs:domain :Thing ;
  rdfs:range [ a rdfs:Datatype ; owl:datatypeComplementOf [ a rdfs:Datatype ; owl:unionOf ( xsd:string xsd:integer ) ] ] .
:either a owl:DatatypeProperty ; rdfs:domain :Thing ; rdfs:range [ a rdfs:Datatype ; owl:unionOf ( xsd:string xsd:integer ) ] .`;
  const rangeOf = (store: Store, p: string) => store.getQuads(EC + p, RDFS + 'range', null, null)[0].object as RdfTerm;

  it('keep their grouping: a complement of a union is ¬(…), not ¬… ∪ …', async () => {
    const store = (await load(ttl)).store as unknown as Store;
    expect(describeDataRange(store, rangeOf(store, 'notWord'))).toBe('¬(xsd:string ∪ xsd:integer)');
  });

  it('count as an asserted range even with no single datatype to name', async () => {
    const store = (await load(ttl)).store as unknown as Store;
    const dp = getDataProperties(store).find((d) => d.name === 'either')!;
    const shown = describeRange({ ...dp, inheritedRange: { range: 'http://www.w3.org/2001/XMLSchema#date', from: 'super' } });
    expect(shown).toMatchObject({ source: 'asserted', labelSuffix: ' (xsd:string ∪ xsd:integer)', menuLabel: 'xsd:string ∪ xsd:integer' });
    expect(shown.tooltipNote).toBe('rdfs:range xsd:string ∪ xsd:integer');
  });
});
