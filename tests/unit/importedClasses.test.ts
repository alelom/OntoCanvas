/**
 * The classes the loaded imports declare (#235): their labels and the ontology that declares each, so the individuals of an
 * imported class are named and drawn by it instead of by a bare IRI and a stub.
 */
import { describe, it, expect } from 'vitest';
import { Parser, Store } from 'n3';
import { definedByName, importedClasses, importedClassLookup } from '../../src/abox/importedClasses';

const ontology = (url: string, iri: string | null, turtle: string) => ({
  url,
  iri,
  store: new Store(
    new Parser().parse(
      '@prefix owl: <http://www.w3.org/2002/07/owl#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> . @prefix skos: <http://www.w3.org/2004/02/skos/core#> . @prefix : <http://example.org/p#> .\n' + turtle
    )
  ),
});

describe('importedClasses', () => {
  it('gives each class an import declares, with its label and the ontology that declares it', () => {
    const classes = importedClasses([ontology('https://example.org/p/2.0', 'https://example.org/p', ':FieldAssertion a owl:Class ; rdfs:label "Field assertion"@en .')]);

    expect(classes.get('http://example.org/p#FieldAssertion')).toEqual({ label: 'Field assertion', definedBy: 'https://example.org/p' });
  });

  it('takes an English or untagged label over others, then a SKOS preferred label, else none', () => {
    const classes = importedClasses([
      ontology('u', null, ':A a owl:Class ; rdfs:label "Ein A"@de , "An A"@en . :B a rdfs:Class ; skos:prefLabel "Bee" . :C a owl:Class .'),
    ]);

    expect(classes.get('http://example.org/p#A')!.label).toBe('An A');
    expect(classes.get('http://example.org/p#B')!.label).toBe('Bee');
    expect(classes.get('http://example.org/p#C')).toEqual({ label: null, definedBy: 'u' });
  });

  it('keeps the first import that declares a class, the nearest one', () => {
    const classes = importedClasses([ontology('first', 'first', ':A a owl:Class ; rdfs:label "First" .'), ontology('second', 'second', ':A a owl:Class ; rdfs:label "Second" .')]);

    expect(classes.get('http://example.org/p#A')).toEqual({ label: 'First', definedBy: 'first' });
  });

  it('leaves out what is not a class: individuals, properties, blank nodes', () => {
    const classes = importedClasses([ontology('u', null, ':x a :A . :p a owl:ObjectProperty . [] a owl:Class .')]);

    expect([...classes.keys()]).toEqual([]);
  });
});

describe('definedByName', () => {
  it('names an ontology by the last part of its IRI, keeping a version with its name', () => {
    expect(definedByName('https://w3id.org/adiro/adiro_provenance')).toBe('adiro_provenance');
    expect(definedByName('https://w3id.org/adiro/adiro_provenance/2.2.0')).toBe('adiro_provenance/2.2.0');
    expect(definedByName('http://www.w3.org/ns/prov#')).toBe('prov');
    expect(definedByName('https://example.org/onto.ttl')).toBe('onto.ttl');
  });
});

describe('importedClassLookup', () => {
  it('reads the classes once per list of imports, and again when the list is another one', () => {
    let list = [ontology('u', 'u', ':A a owl:Class ; rdfs:label "A" .')];
    const lookup = importedClassLookup(() => list);

    expect(lookup('http://example.org/p#A')?.label).toBe('A');
    expect(lookup('http://example.org/p#B')).toBeNull();
    list = [ontology('v', 'v', ':B a owl:Class ; rdfs:label "B" .')];
    expect(lookup('http://example.org/p#B')?.label).toBe('B');
    expect(lookup('http://example.org/p#A')).toBeNull();
  });
});
