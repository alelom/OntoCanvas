import { describe, it, expect } from 'vitest';
import { parseRdfToQuads } from './parseRdfToQuads';

const minimalTurtle = `
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix ex: <http://example.org/ns#> .

ex:TestClass a owl:Class ;
  rdfs:label "Test Class" .
`;

const minimalRdfXml = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:ex="http://example.org/ns#">
  <owl:Class rdf:about="http://example.org/ns#OwlTestClass">
    <rdfs:label>OWL Test Class</rdfs:label>
  </owl:Class>
</rdf:RDF>`;

const minimalJsonLd = `{
  "@context": {
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "owl": "http://www.w3.org/2002/07/owl#",
    "ex": "http://example.org/ns#"
  },
  "@id": "ex:JsonLdClass",
  "@type": "owl:Class",
  "rdfs:label": "JSON-LD Class"
}`;

describe('parseRdfToQuads', () => {
  it('parses Turtle string to quads with contentType', async () => {
    const quads = await parseRdfToQuads(minimalTurtle, { contentType: 'text/turtle' });
    expect(Array.isArray(quads)).toBe(true);
    expect(quads.length).toBeGreaterThan(0);
    const hasClass = quads.some(
      (q) =>
        q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
        q.object.value === 'http://www.w3.org/2002/07/owl#Class'
    );
    expect(hasClass).toBe(true);
  });

  it('parses Turtle string to quads with path (format detection)', async () => {
    const quads = await parseRdfToQuads(minimalTurtle, { path: 'http://example.org/ontology.ttl' });
    expect(quads.length).toBeGreaterThan(0);
  });

  it('parses RDF/XML string to quads with path', async () => {
    const quads = await parseRdfToQuads(minimalRdfXml, { path: 'http://example.org/cob.owl' });
    expect(Array.isArray(quads)).toBe(true);
    expect(quads.length).toBeGreaterThan(0);
    const hasClass = quads.some(
      (q) =>
        q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
        q.object.value === 'http://www.w3.org/2002/07/owl#Class'
    );
    expect(hasClass).toBe(true);
  });

  it('parses RDF/XML with contentType application/rdf+xml', async () => {
    const quads = await parseRdfToQuads(minimalRdfXml, { contentType: 'application/rdf+xml' });
    expect(quads.length).toBeGreaterThan(0);
  });

  it('parses JSON-LD string to quads with path', async () => {
    const quads = await parseRdfToQuads(minimalJsonLd, { path: 'http://example.org/ontology.jsonld' });
    expect(quads.length).toBeGreaterThan(0);
  });

  it('throws on invalid Turtle', async () => {
    await expect(
      parseRdfToQuads('not valid turtle {', { contentType: 'text/turtle' })
    ).rejects.toThrow(/Failed to parse RDF/i);
  });

  it('returns empty or rejects on invalid RDF/XML', async () => {
    const result = await parseRdfToQuads('<broken xml', { path: 'http://example.org/file.owl' }).catch((e) => e);
    if (result instanceof Error) {
      expect(result.message).toMatch(/parse RDF|error/i);
    } else {
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    }
  });

  it('uses path for format detection (.owl → RDF/XML)', async () => {
    const quads = await parseRdfToQuads(minimalRdfXml, { path: 'file.owl' });
    expect(quads.length).toBeGreaterThan(0);
  });

  it('uses path for format detection (.rdf → RDF/XML)', async () => {
    const quads = await parseRdfToQuads(minimalRdfXml, { path: 'https://example.org/ont.rdf' });
    expect(quads.length).toBeGreaterThan(0);
  });
});
