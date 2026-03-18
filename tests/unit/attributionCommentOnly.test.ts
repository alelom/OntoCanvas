import { describe, it, expect } from 'vitest';
import { parseRdfToGraph, storeToTurtle } from '../../src/parser';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getAppVersion } from '../../src/utils/version';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Attribution Comment Only', () => {
  it.skip('should add attribution only as a comment at the top, not in rdfs:comment', async () => {
    // SKIPPED: Comment preservation feature has been deprecated.
    // rdflib does not preserve comments during serialization, and we've decided to accept this limitation.
    // Attribution comments are no longer added to the serialized output.
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology ;
    rdfs:comment "Test ontology" .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test Class" .
`;
    
    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;
    
    const saved = await storeToTurtle(store);
    
    // Should have attribution comment at the top (after prefixes)
    expect(saved).toMatch(/#\s*Created\/edited with https:\/\/alelom\.github\.io\/OntoCanvas\/ version/);
    
    // Should NOT have attribution in rdfs:comment
    const ontologyBlock = saved.match(/:Ontology[\s\S]{0,500}/);
    if (ontologyBlock) {
      expect(ontologyBlock[0]).not.toMatch(/Created\/edited with https:\/\/alelom\.github\.io\/OntoCanvas\/ version/);
    }
    
    // The original rdfs:comment should still be there
    expect(saved).toContain('rdfs:comment "Test ontology"');
  });
  
  it.skip('should replace old attribution comment with new version, not append', async () => {
    // SKIPPED: Comment preservation feature has been deprecated.
    // rdflib does not preserve comments during serialization, and we've decided to accept this limitation.
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
# Created/edited with https://alelom.github.io/OntoCanvas/ version 1.8.1

:Ontology rdf:type owl:Ontology .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test Class" .
`;
    
    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;
    
    // Save (should replace old version with current)
    const saved = await storeToTurtle(store, undefined, ttl);
    
    // Should have only ONE attribution comment (the current version)
    const attributionMatches = saved.match(/#\s*Created\/edited with https:\/\/alelom\.github\.io\/OntoCanvas\/ version [^\n]+/g);
    expect(attributionMatches).toBeDefined();
    expect(attributionMatches?.length).toBe(1);
    
    // Should have current version (from package.json), not old version (1.8.1)
    const { getAppVersion } = await import('../../src/utils/version');
    const currentVersion = getAppVersion();
    expect(saved).toMatch(new RegExp(`version ${currentVersion.replace(/\./g, '\\.')}`));
    expect(saved).not.toMatch(/version 1\.8\.1/);
    
    // Should NOT have attribution in rdfs:comment
    expect(saved).not.toMatch(/rdfs:comment\s+"Created\/edited with/);
  });
  
  it.skip('should not add attribution to rdfs:comment even if ontology has rdfs:comment', async () => {
    // SKIPPED: Comment preservation feature has been deprecated.
    // rdflib does not preserve comments during serialization, and we've decided to accept this limitation.
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology ;
    rdfs:comment "This is a test ontology", "Another comment" .

:TestClass rdf:type owl:Class .
`;
    
    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;
    
    const saved = await storeToTurtle(store);
    
    // Should have attribution comment at the top
    expect(saved).toMatch(/#\s*Created\/edited with https:\/\/alelom\.github\.io\/OntoCanvas\/ version/);
    
    // Should NOT have attribution in rdfs:comment
    const ontologyMatch = saved.match(/:Ontology[\s\S]{0,1000}/);
    if (ontologyMatch) {
      const ontologyBlock = ontologyMatch[0];
      expect(ontologyBlock).not.toMatch(/rdfs:comment\s+"Created\/edited with/);
      // Original comments should still be there
      expect(ontologyBlock).toContain('rdfs:comment "This is a test ontology"');
      expect(ontologyBlock).toContain('"Another comment"');
    }
  });
});
