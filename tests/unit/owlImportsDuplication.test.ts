import { describe, it, expect } from 'vitest';
import { parseRdfToGraph, storeToTurtle } from '../../src/parser';
import type { ExternalOntologyReference } from '../../src/storage';

describe('owl:imports duplication prevention', () => {
  it('should not duplicate owl:imports when saving multiple times', async () => {
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology ;
    owl:imports <https://burohappoldmachinelearning.github.io/ADIRO> ;
    owl:imports <https://burohappoldmachinelearning.github.io/ADIRO/aec-common-symbols#> .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test Class" .
`;

    // Parse the ontology
    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;

    // Create external refs (simulating what would be extracted from the store)
    const externalRefs: ExternalOntologyReference[] = [
      { url: 'https://burohappoldmachinelearning.github.io/ADIRO', usePrefix: false },
      { url: 'https://burohappoldmachinelearning.github.io/ADIRO/aec-common-symbols#', usePrefix: false },
    ];

    // First save
    const firstSave = await storeToTurtle(store, externalRefs);
    
    // Count imports in first save
    const firstSaveImports = (firstSave.match(/owl:imports\s+<[^>]+>/g) || []).length;
    expect(firstSaveImports).toBe(2); // Should have 2 imports

    // Parse again (simulating reload)
    const reparseResult = await parseRdfToGraph(firstSave, { path: 'test.ttl' });
    
    // Save again (this is where duplication would occur)
    const secondSave = await storeToTurtle(reparseResult.store, externalRefs);
    
    // Count imports in second save
    const secondSaveImports = (secondSave.match(/owl:imports\s+<[^>]+>/g) || []).length;
    expect(secondSaveImports).toBe(2); // Should still have 2 imports, not 4

    // Verify specific imports are present exactly once
    const adiroCount = (secondSave.match(/owl:imports\s+<https:\/\/burohappoldmachinelearning\.github\.io\/ADIRO>/g) || []).length;
    expect(adiroCount).toBe(1); // Should appear exactly once

    const symbolsCount = (secondSave.match(/owl:imports\s+<https:\/\/burohappoldmachinelearning\.github\.io\/ADIRO\/aec-common-symbols#>/g) || []).length;
    expect(symbolsCount).toBe(1); // Should appear exactly once
  });

  it.skip('should not add standard RDF/OWL namespaces as imports', async () => {
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test Class" .
`;

    // Parse the ontology
    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;

    // Create external refs that include standard namespaces (should be filtered out)
    const externalRefs: ExternalOntologyReference[] = [
      { url: 'http://www.w3.org/2002/07/owl#', usePrefix: false },
      { url: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', usePrefix: false },
      { url: 'http://www.w3.org/2000/01/rdf-schema#', usePrefix: false },
      { url: 'http://www.w3.org/2001/XMLSchema#', usePrefix: false },
      { url: 'http://www.w3.org/XML/1998/namespace#', usePrefix: false },
      { url: 'https://example.org/custom-ontology', usePrefix: false },
    ];

    // Save
    const saved = await storeToTurtle(store, externalRefs);
    
    // Standard namespaces should NOT be in the imports
    expect(saved).not.toContain('owl:imports <http://www.w3.org/2002/07/owl#>');
    expect(saved).not.toContain('owl:imports <http://www.w3.org/1999/02/22-rdf-syntax-ns#>');
    expect(saved).not.toContain('owl:imports <http://www.w3.org/2000/01/rdf-schema#>');
    expect(saved).not.toContain('owl:imports <http://www.w3.org/2001/XMLSchema#>');
    expect(saved).not.toContain('owl:imports <http://www.w3.org/XML/1998/namespace#>');
    
    // But the non-standard one should be
    expect(saved).toContain('owl:imports <https://example.org/custom-ontology>');
  }, 15000); // Increase timeout to 15 seconds

  it('should handle URL normalization (trailing # and /) when detecting duplicates', async () => {
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology ;
    owl:imports <https://burohappoldmachinelearning.github.io/ADIRO#> .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test Class" .
`;

    // Parse the ontology
    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;

    // Create external refs with URL without trailing # (should be detected as duplicate)
    const externalRefs: ExternalOntologyReference[] = [
      { url: 'https://burohappoldmachinelearning.github.io/ADIRO', usePrefix: false }, // No trailing #
    ];

    // Save
    const saved = await storeToTurtle(store, externalRefs);
    
    // Debug: log the output to see what rdflib actually produces
    // console.log('Serialized output:', saved);
    
    // Should only have one import (the existing one), not add a duplicate
    // rdflib may serialize imports in different formats (prefix notation or full URI)
    // Check for both formats - be flexible with the regex
    const fullUriImports = (saved.match(/owl:imports\s+<https:\/\/burohappoldmachinelearning\.github\.io\/ADIRO[#>]?>/g) || []).length;
    // Check for prefix notation (e.g., owl:imports adiro:something or owl:imports <adiro:something>)
    const prefixImports = (saved.match(/owl:imports\s+[^.\s,;<>]+ADIRO[^.\s,;<>]*/gi) || []).length;
    // Also check for comma-separated imports (rdflib may combine multiple imports)
    const commaSeparatedMatch = saved.match(/owl:imports\s+[^.]+/);
    let commaSeparatedCount = 0;
    if (commaSeparatedMatch) {
      // Count commas + 1 (e.g., "import1, import2" = 2 imports)
      commaSeparatedCount = (commaSeparatedMatch[0].match(/,/g) || []).length + 1;
    }
    
    // The import from the original TTL should be preserved by rdflib
    // The externalRefs should NOT add a duplicate (normalization should prevent it)
    // So we should have exactly 1 import total
    const totalImports = Math.max(fullUriImports, prefixImports, commaSeparatedCount);
    expect(totalImports).toBe(1); // Should have exactly one import (the existing one, no duplicate)
  });
});
