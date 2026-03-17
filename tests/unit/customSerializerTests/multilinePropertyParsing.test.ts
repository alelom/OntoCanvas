import { describe, it, expect } from 'vitest';
import { parsePropertyLinesWithStateMachine } from '../../../src/rdf/propertyLineParser';

describe('Multi-line Property Parsing', () => {
  it('should parse rdfs:subClassOf with comma-separated brackets as a single property line', () => {
    // Simulate the :Detail block structure from aec_drawing_metadata.ttl
    const blockText = `rdfs:subClassOf :DrawingType, 
    [ rdf:type owl:Restriction ; owl:onProperty :hasProperty ; owl:onClass :Orientation ; owl:qualifiedCardinality "1"^^xsd:nonNegativeInteger ], 
    [ rdf:type owl:Restriction ; owl:onProperty :hasProperty ; owl:minQualifiedCardinality "0"^^xsd:nonNegativeInteger ; owl:onClass :DetailLocation ; owl:maxQualifiedCardinality "1"^^xsd:nonNegativeInteger ];`;

    const matches = parsePropertyLinesWithStateMachine(blockText, 0, 1);

    // Should have only ONE property line for rdfs:subClassOf
    const subClassOfMatches = matches.filter(m => m.predicate === 'rdfs:subClassOf');
    expect(subClassOfMatches.length).toBe(1);

    const subClassOfMatch = subClassOfMatches[0];
    
    // Should be multi-line
    expect(subClassOfMatch.isMultiLine).toBe(true);
    
    // Should include the full value from :DrawingType to the last bracket
    const valueText = blockText.slice(
      subClassOfMatch.valueStart - subClassOfMatch.fullStart,
      subClassOfMatch.valueEnd - subClassOfMatch.fullStart
    );
    
    // Should contain :DrawingType
    expect(valueText).toContain(':DrawingType');
    
    // Should contain both bracket structures
    expect(valueText).toContain('[ rdf:type owl:Restriction');
    expect(valueText).toContain('owl:onClass :Orientation');
    expect(valueText).toContain('owl:onClass :DetailLocation');
    
    // Should NOT have separate property lines for rdf:type, owl:onProperty, etc. inside brackets
    const typeMatches = matches.filter(m => m.predicate === 'rdf:type' && m.rawText.includes('owl:Restriction'));
    expect(typeMatches.length).toBe(0); // Should be 0, not parsed as separate properties
  });

  it('should parse rdfs:subClassOf with only brackets (no prefixed name) as a single property line', () => {
    // Simulate the :DrawingSheet block structure
    const blockText = `rdfs:subClassOf 
        [ rdf:type owl:Restriction ; owl:onProperty :contains ; owl:minQualifiedCardinality "0"^^xsd:nonNegativeInteger ; owl:onClass :Note ], 
        [ rdf:type owl:Restriction ; owl:onProperty :contains ; owl:minQualifiedCardinality "0"^^xsd:nonNegativeInteger ; owl:onClass :Legend ];`;

    const matches = parsePropertyLinesWithStateMachine(blockText, 0, 1);

    // Should have only ONE property line for rdfs:subClassOf
    const subClassOfMatches = matches.filter(m => m.predicate === 'rdfs:subClassOf');
    expect(subClassOfMatches.length).toBe(1);

    const subClassOfMatch = subClassOfMatches[0];
    
    // Should be multi-line
    expect(subClassOfMatch.isMultiLine).toBe(true);
    
    // Should include both bracket structures
    const valueText = blockText.slice(
      subClassOfMatch.valueStart - subClassOfMatch.fullStart,
      subClassOfMatch.valueEnd - subClassOfMatch.fullStart
    );
    
    expect(valueText).toContain('[ rdf:type owl:Restriction');
    expect(valueText).toContain('owl:onClass :Note');
    expect(valueText).toContain('owl:onClass :Legend');
    
    // Should NOT have separate property lines for content inside brackets
    const typeMatches = matches.filter(m => m.predicate === 'rdf:type' && m.rawText.includes('owl:Restriction'));
    expect(typeMatches.length).toBe(0);
  });
});
