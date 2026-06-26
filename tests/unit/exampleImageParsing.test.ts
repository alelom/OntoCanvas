import { describe, it, expect } from 'vitest';
import { parseRdfToGraph, getMainOntologyBase, getClassNamespace, storeToTurtle } from '../../src/parser';
import { getExampleImageUrisForClass, setExampleImageUrisForClass } from '../../src/lib/exampleImageStore';
import type { SerializerType } from '../../src/storage';

// Mirrors the canonical ADIRO format: a "#" class namespace, a separate "@base" for relative
// IRIs, and :exampleImage triples whose objects are (relative) IRIs.
const TTL = `@prefix : <https://burohappoldmachinelearning.github.io/ADIRO/aec_drawing_metadata#> .
@base <https://burohappoldmachinelearning.github.io/ADIRO/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<https://burohappoldmachinelearning.github.io/ADIRO/aec_drawing_metadata> rdf:type owl:Ontology .

:exampleImage rdf:type owl:AnnotationProperty ;
    rdfs:label "example image"@en .

:Metadata rdf:type owl:Class ;
    rdfs:label "Metadata" .

:Titleblock rdf:type owl:Class ;
    rdfs:subClassOf :Metadata ;
    rdfs:label "Titleblock" ;
    :exampleImage <img/aec_drawing_ontology/titleblock_01.png> ;
    :exampleImage <img/aec_drawing_ontology/titleblock_02.png> .
`;

describe('example image parsing (ADIRO Titleblock format)', () => {
  it('populates node.exampleImages for a class with :exampleImage IRI objects', async () => {
    const { graphData } = await parseRdfToGraph(TTL, { path: 'aec_drawing_metadata.ttl' });
    const titleblock = graphData.nodes.find((n) => n.id === 'Titleblock');
    expect(titleblock).toBeDefined();
    expect(titleblock!.exampleImages).toBeDefined();
    expect(titleblock!.exampleImages!.length).toBe(2);
    expect(titleblock!.exampleImages!.some((u) => u.includes('titleblock_01.png'))).toBe(true);
    expect(titleblock!.exampleImages!.some((u) => u.includes('titleblock_02.png'))).toBe(true);
  });

  it('getExampleImageUrisForClass finds the images using the resolved ontology base', async () => {
    const { store } = await parseRdfToGraph(TTL, { path: 'aec_drawing_metadata.ttl' });
    const base = getClassNamespace(store) ?? getMainOntologyBase(store);
    const uris = getExampleImageUrisForClass(store, 'Titleblock', base ?? '');
    expect(uris.length).toBe(2);
  });

  it('custom serializer: adds a first example image to a class that had none', async () => {
    const { store, originalFileCache } = await parseRdfToGraph(TTL, { path: 'aec_drawing_metadata.ttl' });
    expect(originalFileCache).toBeTruthy();
    const base = getClassNamespace(store) ?? getMainOntologyBase(store) ?? '';
    const added = 'https://burohappoldmachinelearning.github.io/ADIRO/img/aec_drawing_ontology/metadata_01.png';
    const ok = setExampleImageUrisForClass(store, 'Metadata', [added], base);
    expect(ok).toBe(true);

    const out = await storeToTurtle(store, undefined, TTL, originalFileCache!, 'custom' as SerializerType);
    expect(out).toContain('exampleImage');
    expect(out).toContain('metadata_01.png');
  });

  it('custom serializer: appends a new example image to a class that already has some', async () => {
    const { store, originalFileCache } = await parseRdfToGraph(TTL, { path: 'aec_drawing_metadata.ttl' });
    expect(originalFileCache).toBeTruthy();
    const base = getClassNamespace(store) ?? getMainOntologyBase(store) ?? '';
    const existing = getExampleImageUrisForClass(store, 'Titleblock', base);
    const added = 'https://burohappoldmachinelearning.github.io/ADIRO/img/aec_drawing_ontology/titleblock_03.png';
    const ok = setExampleImageUrisForClass(store, 'Titleblock', [...existing, added], base);
    expect(ok).toBe(true);

    const out = await storeToTurtle(store, undefined, TTL, originalFileCache!, 'custom' as SerializerType);
    expect(out).toContain('titleblock_03.png');
    // The previously existing images must still be present (minimal-diff append, not replace).
    expect(out).toContain('titleblock_01.png');
    expect(out).toContain('titleblock_02.png');
  });
});
