/**
 * Changing one restriction in a class's multi-line rdfs:subClassOf list must touch only that item's
 * changed lines (#108). It used to re-serialize the whole block, putting the list on one line and
 * reordering its items.
 */
import { describe, it, expect } from 'vitest';
import {
  parseRdfToGraph,
  storeToTurtle,
  removeRestrictionFromStore,
  addRestrictionToStore,
  addDataPropertyRestrictionToClass,
  removeDataPropertyRestrictionFromClass,
  getDataPropertyRestrictionsForClass,
  type SerializerType,
} from '../../../src/parser';
import { lineDiff, formatDiff } from './minimalDiff';

const TTL = `@prefix : <http://example.org/sco#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<http://example.org/sco> rdf:type owl:Ontology .

:title rdf:type owl:DatatypeProperty ;
    rdfs:range xsd:string .

:isbn rdf:type owl:DatatypeProperty ;
    rdfs:range xsd:string .

:lends rdf:type owl:ObjectProperty .

:Work rdf:type owl:Class .

:Book rdf:type owl:Class ;
    rdfs:label "Book" ;
    rdfs:subClassOf :Work ,
                    [ rdf:type owl:Restriction ;
                      owl:onProperty :title ;
                      owl:onDataRange xsd:string ;
                      owl:minCardinality "1"^^xsd:nonNegativeInteger ] ,
                    [ rdf:type owl:Restriction ;
                      owl:onProperty :isbn ;
                      owl:onDataRange xsd:string ;
                      owl:qualifiedCardinality "1"^^xsd:nonNegativeInteger ] .

:Loan rdf:type owl:Class ;
    rdfs:subClassOf [ rdf:type owl:Restriction ;
                      owl:onProperty :lends ;
                      owl:onClass :Book ;
                      owl:minQualifiedCardinality "1"^^xsd:nonNegativeInteger
                    ] ,
                    [ rdf:type owl:Restriction ;
                      owl:onProperty :lends ;
                      owl:allValuesFrom :Work ] .
`;

async function setup() {
  const { store, originalFileCache } = await parseRdfToGraph(TTL, { path: 'sco.ttl' });
  const save = () => storeToTurtle(store!, undefined, TTL, originalFileCache!, 'custom' as SerializerType);
  return { store: store!, save };
}

describe('editing one item of a multi-line rdfs:subClassOf list (#108)', () => {
  it('a data-property restriction: only its cardinality lines change', async () => {
    const { store, save } = await setup();
    const range = getDataPropertyRestrictionsForClass(store, 'Book').find((r) => r.propertyName === 'title')!.onDataRange;
    removeDataPropertyRestrictionFromClass(store, 'Book', 'title');
    addDataPropertyRestrictionToClass(store, 'Book', 'title', { minCardinality: 1, maxCardinality: 3 }, range);
    const out = await save();
    const d = lineDiff(TTL, out);
    expect(d.removed, formatDiff(TTL, out)).toEqual(['                      owl:minCardinality "1"^^xsd:nonNegativeInteger ] ,']);
    expect(d.added, formatDiff(TTL, out)).toEqual([
      '                      owl:minQualifiedCardinality "1"^^xsd:nonNegativeInteger ;',
      '                      owl:maxQualifiedCardinality "3"^^xsd:nonNegativeInteger ] ,',
    ]);
  });

  it('an object-property restriction: only its cardinality line changes, the closing bracket stays put', async () => {
    const { store, save } = await setup();
    // What the Edit edge form does when only the cardinality changes.
    removeRestrictionFromStore(store, 'Loan', 'Book', 'lends');
    addRestrictionToStore(store, 'Loan', 'Book', 'lends', { minCardinality: 2, maxCardinality: null });
    const out = await save();
    const d = lineDiff(TTL, out);
    expect(d.removed, formatDiff(TTL, out)).toEqual(['                      owl:minQualifiedCardinality "1"^^xsd:nonNegativeInteger']);
    expect(d.added, formatDiff(TTL, out)).toEqual(['                      owl:minQualifiedCardinality "2"^^xsd:nonNegativeInteger']);
  });

  it('removing an item leaves the others as they were', async () => {
    const { store, save } = await setup();
    expect(removeDataPropertyRestrictionFromClass(store, 'Book', 'title')).toBe(true);
    const out = await save();
    const expected = TTL.replace(`[ rdf:type owl:Restriction ;
                      owl:onProperty :title ;
                      owl:onDataRange xsd:string ;
                      owl:minCardinality "1"^^xsd:nonNegativeInteger ] ,
                    `, '');
    expect(out.replace(/\r\n/g, '\n').replace(/^# Created\/edited with .*\n/m, ''), formatDiff(expected, out)).toBe(expected);
  });
});
