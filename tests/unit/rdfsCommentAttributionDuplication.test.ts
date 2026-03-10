import { describe, it, expect } from 'vitest';
import { parseRdfToGraph, storeToTurtle } from '../../src/parser';
import { postProcessTurtle } from '../../src/turtlePostProcess';

describe('rdfs:comment attribution duplication prevention', () => {
  it('should remove old attribution comments and add only the current version', async () => {
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology ;
    rdfs:comment "Sheet/layout/document structure for AEC drawings.", "Created/edited with https://alelom.github.io/OntoCanvas/ version 1.8.1", "Created/edited with https://alelom.github.io/OntoCanvas/ version 1.8.2" .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test Class" .
`;

    // Parse the ontology
    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;

    // Save (this will trigger post-processing which adds attribution)
    const saved = await storeToTurtle(store);
    
    // Count all occurrences of attribution text in rdfs:comment (quoted strings only)
    // Don't count the attribution comment line - we only care about rdfs:comment duplicates
    const quotedMatches = saved.match(/"Created\/edited with https:\/\/alelom\.github\.io\/OntoCanvas\/ version [^"]+"/g);
    const allAttributionCount = quotedMatches ? quotedMatches.length : 0;
    
    // Should have exactly one attribution in rdfs:comment (the current version), old ones should be removed
    expect(allAttributionCount).toBe(1); // Exactly one attribution in rdfs:comment
    
    // Should not have the old version 1.8.1 (it should be removed)
    // The current version is 1.8.2, so 1.8.2 will be present (that's correct)
    const hasVersion181 = saved.includes('version 1.8.1');
    expect(hasVersion181).toBe(false); // Old version 1.8.1 should be removed
    
    // The original comment should still be there
    expect(saved).toContain('Sheet/layout/document structure for AEC drawings.');
  });

  it('should handle attribution in comma-separated rdfs:comment list', async () => {
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology ;
    rdfs:comment "First comment", "Created/edited with https://alelom.github.io/OntoCanvas/ version 1.8.0", "Second comment", "Created/edited with https://alelom.github.io/OntoCanvas/ version 1.8.1" .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test Class" .
`;

    // Parse the ontology
    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;

    // Save
    const saved = await storeToTurtle(store);
    
    // Count attribution comments
    const attributionMatches = saved.match(/rdfs:comment\s+"Created\/edited with https:\/\/alelom\.github\.io\/OntoCanvas\/ version [^"]+"/g);
    const attributionCount = attributionMatches ? attributionMatches.length : 0;
    
    // Should have exactly one attribution comment
    expect(attributionCount).toBe(1);
    
    // Original comments should still be there
    expect(saved).toContain('First comment');
    expect(saved).toContain('Second comment');
  });

  it('should not duplicate attribution when saving multiple times', async () => {
    // Start with an ontology that already has an attribution comment
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology ;
    rdfs:comment "Created/edited with https://alelom.github.io/OntoCanvas/ version 1.8.1" .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test Class" .
`;

    // Parse the ontology
    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;

    // Save (this should remove old attribution and add current one)
    const saved = await storeToTurtle(store);
    
    // Count all occurrences of attribution text in rdfs:comment (quoted strings only)
    // Don't count the attribution comment line
    const quotedMatches = saved.match(/"Created\/edited with https:\/\/alelom\.github\.io\/OntoCanvas\/ version [^"]+"/g);
    const allAttributionCount = quotedMatches ? quotedMatches.length : 0;
    expect(allAttributionCount).toBe(1); // Should have exactly one attribution in rdfs:comment, not multiple
  });
});
