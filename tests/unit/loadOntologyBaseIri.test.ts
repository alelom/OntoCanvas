import { describe, it, expect } from 'vitest';
import { DataFactory } from 'n3';
import { loadOntologyFromContent } from '../../src/lib/loadOntology';

/**
 * An ontology loaded from a URL resolves relative IRIs against that URL (RDF's base IRI is the
 * retrieval location). The official FOAF RDF/XML contains rdfs:seeAlso rdf:resource="../foafsig" and
 * failed to load with "Found invalid relative IRI '../foafsig' for a missing baseIRI".
 */
describe('loading from a URL uses it as the base IRI', () => {
  const RDFXML = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Ontology rdf:about="http://xmlns.com/foaf/0.1/">
    <rdfs:seeAlso rdf:resource="../foafsig"/>
  </owl:Ontology>
  <owl:Class rdf:about="http://xmlns.com/foaf/0.1/Agent"/>
</rdf:RDF>`;

  it('resolves a relative rdf:resource in RDF/XML against the document URL', async () => {
    const url = 'https://raw.githubusercontent.com/foaf/foaf/master/xmlns.com/htdocs/foaf/0.1/index.rdf';
    const { parseResult } = await loadOntologyFromContent(RDFXML, url);
    const seeAlso = parseResult.store.getQuads(
      DataFactory.namedNode('http://xmlns.com/foaf/0.1/'),
      DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#seeAlso'),
      null,
      null,
    );
    expect(seeAlso.map((q) => q.object.value)).toEqual([
      'https://raw.githubusercontent.com/foaf/foaf/master/xmlns.com/htdocs/foaf/foafsig',
    ]);
    expect(parseResult.graphData.nodes.map((n) => n.id)).toContain('Agent');
  });

  it('resolves a relative IRI in Turtle against the document URL', async () => {
    const ttl = `@prefix owl: <http://www.w3.org/2002/07/owl#> .
<http://example.org/o> a owl:Ontology ; <http://www.w3.org/2000/01/rdf-schema#seeAlso> <../notes> .
<http://example.org/o#A> a owl:Class .`;
    const { parseResult } = await loadOntologyFromContent(ttl, 'https://example.org/onto/v1/o.ttl');
    const seeAlso = parseResult.store.getQuads(null, DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#seeAlso'), null, null);
    expect(seeAlso.map((q) => q.object.value)).toEqual(['https://example.org/onto/notes']);
  });

  it('leaves files opened locally (no URL) as before', async () => {
    const ttl = `@prefix owl: <http://www.w3.org/2002/07/owl#> .
<http://example.org/o#A> a owl:Class .`;
    const { parseResult } = await loadOntologyFromContent(ttl, 'local.ttl');
    expect(parseResult.graphData.nodes.map((n) => n.id)).toEqual(['A']);
  });
});
