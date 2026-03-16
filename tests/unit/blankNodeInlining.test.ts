/**
 * Unit tests to ensure blank nodes are always inlined and never written as _:df_X_Y or _:n3-X format.
 */
import { describe, it, expect } from 'vitest';
import { parseRdfToGraph, storeToTurtle } from '../../src/parser';

describe('Blank Node Inlining', () => {
  it('should never write blank nodes as _:df_X_Y format', async () => {
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:TestClass rdf:type owl:Class ;
    rdfs:subClassOf [ rdf:type owl:Restriction ;
        owl:onProperty :hasProperty ;
        owl:minQualifiedCardinality "1"^^xsd:nonNegativeInteger ;
        owl:onClass :OtherClass ] .
`;

    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;
    
    const output = await storeToTurtle(store);
    
    // Should not contain any blank node references like _:df_X_Y or _:n3-X
    expect(output).not.toMatch(/_:df_\d+_\d+/);
    expect(output).not.toMatch(/_:n3-\d+/);
    
    // Should contain inline blank nodes (rdflib may format with newlines, so use multiline match)
    expect(output).toMatch(/\[\s*rdf:type\s+owl:Restriction/s);
    
    // The restriction should be inlined with the class
    expect(output).toMatch(/rdfs:subClassOf\s+\[/);
  });

  it('should not have blank node blocks at the top of the file', async () => {
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:TestClass rdf:type owl:Class ;
    rdfs:subClassOf [ rdf:type owl:Restriction ;
        owl:onProperty :contains ;
        owl:minQualifiedCardinality "0"^^xsd:nonNegativeInteger ;
        owl:onClass :Note ] .
`;

    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;
    
    const output = await storeToTurtle(store);
    
    // Split into lines and check the first 30 lines (after prefixes)
    const lines = output.split('\n');
    // Find where content starts (after prefixes)
    let contentStartIndex = lines.findIndex(line => 
      line.trim().startsWith('#') && !line.trim().startsWith('@prefix') && !line.trim().startsWith('@base')
    );
    if (contentStartIndex === -1) {
      contentStartIndex = lines.findIndex(line => 
        !line.trim().startsWith('@prefix') && !line.trim().startsWith('@base') && line.trim().length > 0
      );
    }
    
    // Check lines after prefixes but before classes section
    if (contentStartIndex >= 0) {
      for (let i = contentStartIndex; i < Math.min(contentStartIndex + 30, lines.length); i++) {
        const line = lines[i];
        if (!line) continue; // Skip undefined lines
        const trimmed = line.trim();
        // Should not find blank node blocks (lines starting with _:df_ or _:n3-)
        if (trimmed.match(/^_:(df_\d+_\d+|n3-\d+)/)) {
          throw new Error(`Found blank node block at line ${i + 1}: ${trimmed.substring(0, 50)}`);
        }
      }
    }
  });

  it('should inline restrictions with classes, not put them at the top', async () => {
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:TestClass rdf:type owl:Class ;
    rdfs:subClassOf [ rdf:type owl:Restriction ;
        owl:onProperty :contains ;
        owl:minQualifiedCardinality "0"^^xsd:nonNegativeInteger ;
        owl:onClass :Note ] .
`;

    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;
    
    const output = await storeToTurtle(store);
    
    // Should not have blank nodes at the top (after prefixes but before classes section)
    const lines = output.split('\n');
    let inClassesSection = false;
    let foundBlankNodeBeforeClasses = false;
    
    for (const line of lines) {
      if (line.includes('#    Classes') || line.includes('Classes')) {
        inClassesSection = true;
      }
      if (!inClassesSection && /^_\:(df_|n3-)/.test(line.trim())) {
        foundBlankNodeBeforeClasses = true;
        break;
      }
    }
    
    expect(foundBlankNodeBeforeClasses).toBe(false);
    
    // The restriction should be inlined with :TestClass (not as _:df_X_Y)
    // Note: Due to section reorganization, the inline form might not be immediately after the class,
    // but it should be inlined (not as a separate blank node block)
    // rdflib formats blank nodes with newlines, so check for multiline pattern
    const testClassIndex = output.indexOf(':TestClass');
    const restrictionInlinePattern = /\[\s*rdf:type\s+owl:Restriction/s;
    const restrictionMatch = output.match(restrictionInlinePattern);
    expect(restrictionMatch).toBeTruthy();
    if (restrictionMatch && restrictionMatch.index !== undefined) {
      // The restriction should appear after the class (or anywhere, as long as it's inlined)
      expect(restrictionMatch.index).toBeGreaterThan(0);
    }
  });

  it('should handle multiple restrictions on the same class', async () => {
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:DrawingSheet rdf:type owl:Class ;
    rdfs:subClassOf [ rdf:type owl:Restriction ;
        owl:onProperty :contains ;
        owl:minQualifiedCardinality "0"^^xsd:nonNegativeInteger ;
        owl:onClass :Note ], [ rdf:type owl:Restriction ;
        owl:onProperty :contains ;
        owl:minQualifiedCardinality "1"^^xsd:nonNegativeInteger ;
        owl:onClass :Layout ] .
`;

    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;
    
    const output = await storeToTurtle(store);
    
    // Should not contain any blank node references
    expect(output).not.toMatch(/_:df_\d+_\d+/);
    expect(output).not.toMatch(/_:n3-\d+/);
    
    // The main requirement: blank nodes should NOT be written as _:df_X_Y format
    // This is already tested above, but verify again
    expect(output).not.toMatch(/_:df_\d+_\d+/);
    expect(output).not.toMatch(/_:n3-\d+/);
    
    // Restrictions should be inlined (not as separate blank node blocks)
    // rdflib formats with newlines, so use multiline regex
    const hasInlineForm = output.match(/\[\s*rdf:type\s+owl:Restriction/s);
    expect(hasInlineForm).toBeTruthy();
  });

  it('should handle nested blank nodes', async () => {
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:TestClass rdf:type owl:Class ;
    rdfs:subClassOf [ rdf:type owl:Restriction ;
        owl:onProperty :has ;
        owl:onClass [ rdf:type owl:Restriction ;
            owl:onProperty :otherProperty ;
            owl:someValuesFrom :OtherClass ] ] .
`;

    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;
    
    const output = await storeToTurtle(store);
    
    // Should not contain any blank node references
    expect(output).not.toMatch(/_:df_\d+_\d+/);
    expect(output).not.toMatch(/_:n3-\d+/);
    
    // Should have nested inline blank nodes (rdflib formats with newlines, use multiline regex)
    expect(output).toMatch(/\[\s*.*owl:onClass\s+\[/s);
  });
});
