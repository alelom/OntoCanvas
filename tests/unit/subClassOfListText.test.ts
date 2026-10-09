/**
 * Text helpers for editing a class's rdfs:subClassOf list in place (#108): find each item, and write a
 * replacement in the layout of the item it replaces.
 */
import { describe, it, expect } from 'vitest';
import { findSubClassOfItems, formatLikeOriginal } from '../../src/rdf/subClassOfListText';

const BLOCK = `:Book rdf:type owl:Class ;
    rdfs:label "Book, a; [thing]" ;
    rdfs:subClassOf <http://example.org/a.b#Work> ,
                    [ rdf:type owl:Restriction ;
                      owl:onProperty :title ;
                      owl:minCardinality "1"^^xsd:nonNegativeInteger ] , # a comment, with [brackets]
                    :Thing ;
    rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :isbn ; owl:hasValue "x.y" ] .`;

describe('findSubClassOfItems', () => {
  it('finds every item of every rdfs:subClassOf, skipping strings, IRIs and comments', () => {
    const items = findSubClassOfItems(BLOCK);
    expect(items.map((i) => BLOCK.slice(i.start, i.end))).toEqual([
      '<http://example.org/a.b#Work>',
      `[ rdf:type owl:Restriction ;
                      owl:onProperty :title ;
                      owl:minCardinality "1"^^xsd:nonNegativeInteger ]`,
      ':Thing',
      '[ a owl:Restriction ; owl:onProperty :isbn ; owl:hasValue "x.y" ]',
    ]);
    expect(items.map((i) => i.list)).toEqual([0, 0, 0, 1]);
  });

  it('returns nothing for a block without rdfs:subClassOf', () => {
    expect(findSubClassOfItems(':A rdfs:label "rdfs:subClassOf" .')).toEqual([]);
  });
});

describe('formatLikeOriginal', () => {
  const original = `[ rdf:type owl:Restriction ;
                      owl:onProperty :title ;
                      owl:onDataRange xsd:string ;
                      owl:minCardinality "1"^^xsd:nonNegativeInteger ]`;

  it('lays a multi-line replacement out like the original, keeping its unchanged lines', () => {
    const replacement =
      '[ rdf:type owl:Restriction ; owl:onProperty :title ; owl:onDataRange xsd:string ; ' +
      'owl:minQualifiedCardinality "1"^^xsd:nonNegativeInteger ; owl:maxQualifiedCardinality "3"^^xsd:nonNegativeInteger ]';
    expect(formatLikeOriginal(replacement, original)).toBe(`[ rdf:type owl:Restriction ;
                      owl:onProperty :title ;
                      owl:onDataRange xsd:string ;
                      owl:minQualifiedCardinality "1"^^xsd:nonNegativeInteger ;
                      owl:maxQualifiedCardinality "3"^^xsd:nonNegativeInteger ]`);
  });

  it('keeps the original order of the parts it shares with the replacement', () => {
    const replacement = '[ owl:onProperty :title ; rdf:type owl:Restriction ; owl:onDataRange xsd:string ; owl:maxCardinality "2"^^xsd:nonNegativeInteger ]';
    expect(formatLikeOriginal(replacement, original).split('\n').map((l) => l.trim())).toEqual([
      '[ rdf:type owl:Restriction ;',
      'owl:onProperty :title ;',
      'owl:onDataRange xsd:string ;',
      'owl:maxCardinality "2"^^xsd:nonNegativeInteger ]',
    ]);
  });

  it('keeps a nested bracket in one part', () => {
    const replacement = '[ rdf:type owl:Restriction ; owl:onProperty :code ; owl:onDataRange [ rdf:type rdfs:Datatype ; owl:onDatatype xsd:string ] ]';
    expect(formatLikeOriginal(replacement, original)).toBe(`[ rdf:type owl:Restriction ;
                      owl:onProperty :code ;
                      owl:onDataRange [ rdf:type rdfs:Datatype ; owl:onDatatype xsd:string ] ]`);
  });

  it('leaves a single-line original single-line', () => {
    const replacement = '[ rdf:type owl:Restriction ; owl:onProperty :p ; owl:someValuesFrom :B ]';
    expect(formatLikeOriginal(replacement, '[ rdf:type owl:Restriction ; owl:onProperty :p ; owl:someValuesFrom :A ]')).toBe(replacement);
  });

  it('keeps a closing bracket on its own line', () => {
    const orig = `[ rdf:type owl:Restriction ;
      owl:onProperty :p ;
      owl:someValuesFrom :A
    ]`;
    expect(formatLikeOriginal('[ rdf:type owl:Restriction ; owl:onProperty :p ; owl:someValuesFrom :B ]', orig)).toBe(`[ rdf:type owl:Restriction ;
      owl:onProperty :p ;
      owl:someValuesFrom :B
    ]`);
  });
});
