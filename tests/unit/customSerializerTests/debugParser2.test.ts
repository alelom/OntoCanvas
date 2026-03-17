import { describe, it, expect } from 'vitest';
import { parsePropertyLinesWithStateMachine } from '../../../src/rdf/propertyLineParser';

describe('Debug Parser 2', () => {
  it('should debug what the parser produces for :DrawingType, [ ... ]', () => {
    const blockText = `rdfs:subClassOf :DrawingType, 
    [ rdf:type owl:Restriction ; owl:onProperty :hasProperty ; owl:onClass :Orientation ; owl:qualifiedCardinality "1"^^xsd:nonNegativeInteger ], 
    [ rdf:type owl:Restriction ; owl:onProperty :hasProperty ; owl:minQualifiedCardinality "0"^^xsd:nonNegativeInteger ; owl:onClass :DetailLocation ; owl:maxQualifiedCardinality "1"^^xsd:nonNegativeInteger ];`;

    const matches = parsePropertyLinesWithStateMachine(blockText, 0, 1);

    console.log('Total matches:', matches.length);
    matches.forEach((match, idx) => {
      console.log(`Match ${idx}:`);
      console.log('  Predicate:', match.predicate);
      console.log('  Value start:', match.valueStart);
      console.log('  Value end:', match.valueEnd);
      console.log('  Full start:', match.fullStart);
      console.log('  Full end:', match.fullEnd);
      console.log('  Raw text:', JSON.stringify(match.rawText));
      console.log('  Is multi-line:', match.isMultiLine);
      console.log('  Line numbers:', match.lineNumbers);
      const valueText = blockText.slice(
        match.valueStart - match.fullStart,
        match.valueEnd - match.fullStart
      );
      console.log('  Value text:', JSON.stringify(valueText));
      console.log('');
    });

    // This test is just for debugging - no assertions
    expect(matches.length).toBeGreaterThan(0);
  });
});
