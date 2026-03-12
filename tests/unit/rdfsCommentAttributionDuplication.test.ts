import { describe, it, expect } from 'vitest';
import { parseRdfToGraph, storeToTurtle } from '../../src/parser';

describe('rdfs:comment attribution duplication prevention', () => {
  it('should not add attribution to rdfs:comment, only as a comment at the top', async () => {
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology ;
    rdfs:comment "Sheet/layout/document structure for AEC drawings." .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test Class" .
`;

    // Parse the ontology
    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;

    // Save (this will trigger post-processing which adds attribution)
    const saved = await storeToTurtle(store);
    
    // Should have attribution comment at the top
    expect(saved).toMatch(/#\s*Created\/edited with https:\/\/alelom\.github\.io\/OntoCanvas\/ version/);
    
    // Should NOT have attribution in rdfs:comment (quoted strings)
    const quotedMatches = saved.match(/"Created\/edited with https:\/\/alelom\.github\.io\/OntoCanvas\/ version [^"]+"/g);
    const allAttributionCount = quotedMatches ? quotedMatches.length : 0;
    expect(allAttributionCount).toBe(0); // No attribution in rdfs:comment
    
    // The original comment should still be there
    expect(saved).toContain('Sheet/layout/document structure for AEC drawings.');
  });

  it('should remove attribution from rdfs:comment when saving', async () => {
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

    // Save (this will remove attribution from rdfs:comment and add it as a comment at the top)
    const saved = await storeToTurtle(store);
    
    // Should have attribution comment at the top
    expect(saved).toMatch(/#\s*Created\/edited with https:\/\/alelom\.github\.io\/OntoCanvas\/ version/);
    
    // Should NOT have attribution in rdfs:comment (quoted strings)
    const quotedMatches = saved.match(/"Created\/edited with https:\/\/alelom\.github\.io\/OntoCanvas\/ version [^"]+"/g);
    const attributionCount = quotedMatches ? quotedMatches.length : 0;
    expect(attributionCount).toBe(0); // No attribution in rdfs:comment
    
    // Original comments should still be there
    expect(saved).toContain('First comment');
    expect(saved).toContain('Second comment');
  });

  it('should replace old attribution comment with current version when saving multiple times', async () => {
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

    // Parse the ontology
    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;

    // Save (this should replace old attribution comment with current one)
    const saved = await storeToTurtle(store, undefined, ttl);
    
    // Should have only ONE attribution comment (the current version)
    const commentMatches = saved.match(/#\s*Created\/edited with https:\/\/alelom\.github\.io\/OntoCanvas\/ version [^\n]+/g);
    expect(commentMatches).toBeDefined();
    expect(commentMatches?.length).toBe(1); // Exactly one attribution comment
    
    // Should have current version (from package.json), not old version (1.8.1)
    const { getAppVersion } = await import('../../src/utils/version');
    const currentVersion = getAppVersion();
    expect(saved).toMatch(new RegExp(`version ${currentVersion.replace(/\./g, '\\.')}`));
    expect(saved).not.toMatch(/version 1\.8\.1/);
    
    // Should NOT have attribution in rdfs:comment
    const quotedMatches = saved.match(/"Created\/edited with https:\/\/alelom\.github\.io\/OntoCanvas\/ version [^"]+"/g);
    const allAttributionCount = quotedMatches ? quotedMatches.length : 0;
    expect(allAttributionCount).toBe(0); // No attribution in rdfs:comment
  });
});
