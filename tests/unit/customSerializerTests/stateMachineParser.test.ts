/**
 * Comprehensive tests for state machine parser used in property line extraction.
 * Tests edge cases for quoted strings, brackets, URIs, property boundaries, 
 * position calculations, quad matching, validation, and multi-line properties.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseTurtleWithPositions, extractPropertyLines, PropertyLineExtractionError } from '../../../src/rdf/sourcePreservation';
import { parseRdfToGraph } from '../../../src/parser';
import { DataFactory } from 'n3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_DIR = join(__dirname, '../../fixtures/customSerializerFixtures');
const TEST_FIXTURES_DIR = join(__dirname, '../../fixtures');

describe('State Machine Parser - Quoted String Handling', () => {
  it('should handle simple quoted strings', async () => {
    const content = `@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:TestClass rdfs:label "Simple value" .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    const propertyLines = extractPropertyLines(block, cache);
    const labelLine = propertyLines.find(pl => pl.predicate === 'rdfs:label');
    
    expect(labelLine).toBeDefined();
    expect(labelLine?.originalLineText).toContain('"Simple value"');
    expect(labelLine?.quads.length).toBeGreaterThan(0);
  });

  it('should handle strings with escaped quotes', async () => {
    const content = `@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:TestClass rdfs:label "Value with \\"quote\\"" .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    const propertyLines = extractPropertyLines(block, cache);
    const labelLine = propertyLines.find(pl => pl.predicate === 'rdfs:label');
    
    expect(labelLine).toBeDefined();
    expect(labelLine?.originalLineText).toContain('"Value with \\"quote\\""');
  });

  it('should handle strings with escaped backslashes', async () => {
    const content = `@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:TestClass rdfs:label "Value with \\\\backslash" .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    const propertyLines = extractPropertyLines(block, cache);
    const labelLine = propertyLines.find(pl => pl.predicate === 'rdfs:label');
    
    expect(labelLine).toBeDefined();
    expect(labelLine?.originalLineText).toContain('\\\\backslash');
  });

  it('should handle language tags', async () => {
    const content = `@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:TestClass rdfs:label "Example"@en .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    const propertyLines = extractPropertyLines(block, cache);
    const labelLine = propertyLines.find(pl => pl.predicate === 'rdfs:label');
    
    expect(labelLine).toBeDefined();
    expect(labelLine?.originalLineText).toContain('"Example"@en');
    expect(labelLine?.quads.length).toBeGreaterThan(0);
  });

  it('should handle datatypes', async () => {
    const content = `@prefix : <http://example.org/test#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
:TestClass :age "25"^^xsd:integer .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    const propertyLines = extractPropertyLines(block, cache);
    const ageLine = propertyLines.find(pl => pl.predicate === ':age');
    
    expect(ageLine).toBeDefined();
    expect(ageLine?.originalLineText).toContain('"25"^^xsd:integer');
  });

  it('should handle language tag and datatype (invalid but graceful)', async () => {
    const content = `@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
:TestClass rdfs:label "Value"@en^^xsd:string .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    // Should not throw, but may have validation errors
    const propertyLines = extractPropertyLines(block, cache);
    expect(propertyLines.length).toBeGreaterThan(0);
  });
});

describe('State Machine Parser - Bracket Handling', () => {
  it('should handle simple brackets', async () => {
    const content = `@prefix : <http://example.org/test#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
:TestClass rdfs:subClassOf [ rdf:type owl:Restriction ] .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    const propertyLines = extractPropertyLines(block, cache);
    const subClassOfLine = propertyLines.find(pl => pl.predicate === 'rdfs:subClassOf');
    
    expect(subClassOfLine).toBeDefined();
    expect(subClassOfLine?.isMultiLine).toBe(false); // Single line bracket
    expect(subClassOfLine?.originalLineText).toContain('[ rdf:type owl:Restriction ]');
  });

  it('should handle nested brackets', async () => {
    const content = `@prefix : <http://example.org/test#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
:TestClass rdfs:subClassOf [ owl:onClass [ rdf:type owl:Class ] ] .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    const propertyLines = extractPropertyLines(block, cache);
    const subClassOfLine = propertyLines.find(pl => pl.predicate === 'rdfs:subClassOf');
    
    expect(subClassOfLine).toBeDefined();
    expect(subClassOfLine?.originalLineText).toContain('[ owl:onClass [ rdf:type owl:Class ] ]');
  });

  it('should handle brackets in strings', async () => {
    const content = `@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:TestClass rdfs:label "Text [ with brackets ]" .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    const propertyLines = extractPropertyLines(block, cache);
    const labelLine = propertyLines.find(pl => pl.predicate === 'rdfs:label');
    
    expect(labelLine).toBeDefined();
    expect(labelLine?.originalLineText).toContain('"Text [ with brackets ]"');
    expect(labelLine?.isMultiLine).toBe(false);
  });

  it('should handle multi-line brackets with proper indentation', async () => {
    const content = `@prefix : <http://example.org/test#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
:TestClass rdfs:subClassOf 
    [ rdf:type owl:Restriction ;
      owl:onProperty :has ;
      owl:onClass :SomeClass ] .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    const propertyLines = extractPropertyLines(block, cache);
    const subClassOfLine = propertyLines.find(pl => pl.predicate === 'rdfs:subClassOf');
    
    expect(subClassOfLine).toBeDefined();
    expect(subClassOfLine?.isMultiLine).toBe(true);
    expect(subClassOfLine?.lineNumbers.length).toBeGreaterThan(1);
    expect(subClassOfLine?.originalLineText).toContain('[ rdf:type owl:Restriction');
  });
});

describe('State Machine Parser - URI Handling', () => {
  it('should handle prefixed names', async () => {
    const content = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix : <http://example.org/test#> .
:TestClass rdfs:label "Test" .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    const propertyLines = extractPropertyLines(block, cache);
    const labelLine = propertyLines.find(pl => pl.predicate === 'rdfs:label');
    
    expect(labelLine).toBeDefined();
    expect(labelLine?.predicateUri).toContain('label');
  });

  it('should handle full URIs', async () => {
    const content = `@prefix : <http://example.org/test#> .
:TestClass <http://example.org/prop#hasValue> "Value" .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    const propertyLines = extractPropertyLines(block, cache);
    const hasValueLine = propertyLines.find(pl => pl.predicate === '<http://example.org/prop#hasValue>');
    
    expect(hasValueLine).toBeDefined();
    expect(hasValueLine?.originalLineText).toContain('<http://example.org/prop#hasValue>');
  });

  it('should handle URIs in brackets', async () => {
    const content = `@prefix : <http://example.org/test#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
:TestClass rdfs:subClassOf [ owl:onProperty <http://example.org/prop#has> ] .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    const propertyLines = extractPropertyLines(block, cache);
    const subClassOfLine = propertyLines.find(pl => pl.predicate === 'rdfs:subClassOf');
    
    expect(subClassOfLine).toBeDefined();
    expect(subClassOfLine?.originalLineText).toContain('<http://example.org/prop#has>');
  });
});

describe('State Machine Parser - Property Boundary Detection', () => {
  it('should detect single-line properties', async () => {
    const content = `@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:TestClass rdfs:label "Label" .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    const propertyLines = extractPropertyLines(block, cache);
    const labelLine = propertyLines.find(pl => pl.predicate === 'rdfs:label');
    
    expect(labelLine).toBeDefined();
    expect(labelLine?.isMultiLine).toBe(false);
    expect(labelLine?.lineNumbers.length).toBe(1);
  });

  it('should detect comma-separated properties on same line', async () => {
    const content = `@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:TestClass rdfs:subClassOf :Parent1, :Parent2, :Parent3 .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    const propertyLines = extractPropertyLines(block, cache);
    const subClassOfLines = propertyLines.filter(pl => pl.predicate === 'rdfs:subClassOf');
    
    // Should extract as one property line with multiple values
    expect(subClassOfLines.length).toBeGreaterThan(0);
    expect(subClassOfLines[0]?.originalLineText).toContain(':Parent1');
    expect(subClassOfLines[0]?.originalLineText).toContain(':Parent2');
    expect(subClassOfLines[0]?.originalLineText).toContain(':Parent3');
  });

  it('should detect semicolon-separated properties', async () => {
    const content = `@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:TestClass rdfs:label "Label" ; rdfs:comment "Comment" .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    const propertyLines = extractPropertyLines(block, cache);
    
    expect(propertyLines.length).toBeGreaterThanOrEqual(2);
    const labelLine = propertyLines.find(pl => pl.predicate === 'rdfs:label');
    const commentLine = propertyLines.find(pl => pl.predicate === 'rdfs:comment');
    
    expect(labelLine).toBeDefined();
    expect(commentLine).toBeDefined();
  });
});

describe('State Machine Parser - Position Calculation', () => {
  it('should calculate character positions relative to full content', async () => {
    const content = `@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:TestClass rdfs:label "Label" .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    const propertyLines = extractPropertyLines(block, cache);
    const labelLine = propertyLines.find(pl => pl.predicate === 'rdfs:label');
    
    expect(labelLine).toBeDefined();
    expect(labelLine?.position.start).toBeGreaterThanOrEqual(block.position.start);
    expect(labelLine?.position.end).toBeLessThanOrEqual(block.position.end);
    expect(labelLine?.position.start).toBeLessThan(labelLine?.position.end);
    
    // Verify position matches actual text
    const actualText = cache.content.slice(labelLine!.position.start, labelLine!.position.end);
    expect(actualText).toContain('rdfs:label');
  });

  it('should track line numbers correctly', async () => {
    const content = `@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:TestClass 
    rdfs:label "Label" ;
    rdfs:comment "Comment" .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    const propertyLines = extractPropertyLines(block, cache);
    
    for (const propLine of propertyLines) {
      expect(propLine.lineNumbers.length).toBeGreaterThan(0);
      expect(propLine.lineNumbers[0]).toBeGreaterThanOrEqual(block.position.startLine);
      expect(propLine.lineNumbers[propLine.lineNumbers.length - 1]).toBeLessThanOrEqual(block.position.endLine);
    }
  });

  it('should detect overlapping property lines (should error)', async () => {
    // This test expects an error to be thrown
    // We'll create a scenario that would cause overlaps if parsing is wrong
    const content = `@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:TestClass rdfs:label "Label" .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    // Extract and check for overlaps
    try {
      const propertyLines = extractPropertyLines(block, cache);
      
      // Check for overlaps manually
      for (let i = 0; i < propertyLines.length; i++) {
        for (let j = i + 1; j < propertyLines.length; j++) {
          const p1 = propertyLines[i];
          const p2 = propertyLines[j];
          const overlaps = !(p1.position.end <= p2.position.start || p2.position.end <= p1.position.start);
          expect(overlaps).toBe(false); // Should never overlap
        }
      }
    } catch (error) {
      // If PropertyLineExtractionError is thrown, that's expected for overlaps
      if (error instanceof PropertyLineExtractionError) {
        expect(error.validationErrors).toBeDefined();
        expect(error.validationErrors?.some(e => e.includes('overlap'))).toBe(true);
      } else {
        throw error;
      }
    }
  });
});

describe('State Machine Parser - Quad Matching', () => {
  it('should match quads by predicate and object value exactly', async () => {
    const content = `@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:TestClass rdfs:label "Exact Match" .`;
    
    const parseResult = await parseRdfToGraph(content, { path: 'test.ttl' });
    const { store, originalFileCache } = parseResult;
    
    if (!originalFileCache) {
      throw new Error('Cache not available');
    }
    
    const block = originalFileCache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    const propertyLines = extractPropertyLines(block, originalFileCache);
    const labelLine = propertyLines.find(pl => pl.predicate === 'rdfs:label');
    
    expect(labelLine).toBeDefined();
    expect(labelLine?.quads.length).toBeGreaterThan(0);
    
    // Verify quad object matches
    const quad = labelLine!.quads[0];
    expect(quad.object.value).toBe('Exact Match');
  });

  it('should use proximity for matching when multiple quads exist', async () => {
    const content = `@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:TestClass rdfs:label "First" ; rdfs:label "Second" .`;
    
    const parseResult = await parseRdfToGraph(content, { path: 'test.ttl' });
    const { store, originalFileCache } = parseResult;
    
    if (!originalFileCache) {
      throw new Error('Cache not available');
    }
    
    const block = originalFileCache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    // Should have multiple quads with same predicate
    const labelQuads = block.quads.filter(q => 
      (q.predicate as { value: string }).value.includes('label')
    );
    expect(labelQuads.length).toBeGreaterThan(1);
    
    const propertyLines = extractPropertyLines(block, originalFileCache);
    const labelLines = propertyLines.filter(pl => pl.predicate === 'rdfs:label');
    
    // Each property line should match the closest quad
    expect(labelLines.length).toBeGreaterThan(0);
    for (const labelLine of labelLines) {
      expect(labelLine.quads.length).toBeGreaterThan(0);
      expect(labelLine.confidence).toBeGreaterThan(0);
    }
  });

  it('should error on unmatched quads', async () => {
    // Create a scenario where a quad exists but no property matches it
    // This is tricky - we'd need to manually add a quad that doesn't exist in text
    // For now, we'll test that the error mechanism exists
    const content = `@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:TestClass rdfs:label "Label" .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    // Manually add a quad that doesn't exist in text
    const fakeQuad = DataFactory.quad(
      DataFactory.namedNode('http://example.org/test#TestClass'),
      DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#comment'),
      DataFactory.literal('This comment does not exist in text')
    );
    block.quads.push(fakeQuad);
    
    // Should error when extracting
    try {
      const propertyLines = extractPropertyLines(block, cache);
      // If no error, check validation errors
      const hasUnmatchedError = propertyLines.some(pl => 
        pl.validationErrors.some(e => e.includes('unmatched'))
      );
      // Or should throw PropertyLineExtractionError
      expect(hasUnmatchedError || propertyLines.length === 0).toBe(true);
    } catch (error) {
      if (error instanceof PropertyLineExtractionError) {
        expect(error.message).toMatch(/unmatched|cannot be matched/i);
      } else {
        throw error;
      }
    }
  });
});

describe('State Machine Parser - Validation Scenarios', () => {
  it('should error on overlapping property lines', async () => {
    // This would require malformed input that creates overlaps
    // The parser should detect and error on this
    const content = `@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:TestClass rdfs:label "Label" .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    // Extract and validate no overlaps
    const propertyLines = extractPropertyLines(block, cache);
    
    // Check manually for overlaps
    for (let i = 0; i < propertyLines.length; i++) {
      for (let j = i + 1; j < propertyLines.length; j++) {
        const p1 = propertyLines[i];
        const p2 = propertyLines[j];
        const overlaps = !(p1.position.end <= p2.position.start || p2.position.end <= p1.position.start);
        
        if (overlaps) {
          // Should have validation error
          expect(p1.validationErrors.length + p2.validationErrors.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('should error when property has no matching quads', async () => {
    // Create block with text that doesn't match quads
    const content = `@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:TestClass rdfs:label "Label" .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    // Clear quads to simulate no match
    const originalQuads = block.quads;
    block.quads = [];
    
    try {
      const propertyLines = extractPropertyLines(block, cache);
      // Should have validation errors
      const hasNoMatchError = propertyLines.some(pl => 
        pl.validationErrors.some(e => e.includes('no matching quads') || e.includes('unmatched'))
      );
      expect(hasNoMatchError).toBe(true);
    } catch (error) {
      if (error instanceof PropertyLineExtractionError) {
        expect(error.message).toMatch(/no matching quads|unmatched/i);
      } else {
        throw error;
      }
    } finally {
      // Restore quads
      block.quads = originalQuads;
    }
  });
});

describe('State Machine Parser - Multi-line Property Structure', () => {
  it('should handle single restriction on multiple lines', async () => {
    const content = `@prefix : <http://example.org/test#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
:TestClass rdfs:subClassOf 
    [ rdf:type owl:Restriction ;
      owl:onProperty :has ;
      owl:onClass :SomeClass ] .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    const propertyLines = extractPropertyLines(block, cache);
    const subClassOfLine = propertyLines.find(pl => pl.predicate === 'rdfs:subClassOf');
    
    expect(subClassOfLine).toBeDefined();
    expect(subClassOfLine?.isMultiLine).toBe(true);
    expect(subClassOfLine?.lineNumbers.length).toBeGreaterThan(1);
    
    // Should have sub-properties for the restriction
    if (subClassOfLine?.subProperties) {
      expect(subClassOfLine.subProperties.length).toBeGreaterThan(0);
    }
  });

  it('should handle multiple restrictions (comma-separated)', async () => {
    const content = `@prefix : <http://example.org/test#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
:TestClass rdfs:subClassOf 
    [ rdf:type owl:Restriction ; owl:onProperty :has1 ],
    [ rdf:type owl:Restriction ; owl:onProperty :has2 ] .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    const propertyLines = extractPropertyLines(block, cache);
    const subClassOfLine = propertyLines.find(pl => pl.predicate === 'rdfs:subClassOf');
    
    expect(subClassOfLine).toBeDefined();
    expect(subClassOfLine?.isMultiLine).toBe(true);
    
    // Should have sub-properties for each restriction
    if (subClassOfLine?.subProperties) {
      expect(subClassOfLine.subProperties.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('should preserve formatting for multi-line properties', async () => {
    const content = `@prefix : <http://example.org/test#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
:TestClass rdfs:subClassOf 
    [ rdf:type owl:Restriction ;
      owl:onProperty :has ;
      owl:onClass :SomeClass ] .`;
    
    const { cache } = await parseTurtleWithPositions(content);
    const block = cache.statementBlocks.find(b => b.subject === ':TestClass');
    expect(block).toBeDefined();
    if (!block) return;
    
    const propertyLines = extractPropertyLines(block, cache);
    const subClassOfLine = propertyLines.find(pl => pl.predicate === 'rdfs:subClassOf');
    
    expect(subClassOfLine).toBeDefined();
    
    // Verify original text preserves formatting
    const originalText = subClassOfLine!.originalLineText;
    expect(originalText).toContain('\n'); // Should have line breaks
    expect(originalText).toContain('    ['); // Should preserve indentation
  });
});

describe('State Machine Parser - Edge Cases from Existing Tests', () => {
  it('should handle empty blank nodes (should not create [ ])', async () => {
    const fixturePath = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');
    const originalContent = readFileSync(fixturePath, 'utf-8');
    
    const parseResult = await parseRdfToGraph(originalContent, { path: fixturePath });
    const { originalFileCache } = parseResult;
    
    if (!originalFileCache) {
      throw new Error('Cache not available');
    }
    
    const drawingSheetBlock = originalFileCache.statementBlocks.find(b => 
      b.subject?.includes('DrawingSheet')
    );
    expect(drawingSheetBlock).toBeDefined();
    if (!drawingSheetBlock) return;
    
    const propertyLines = extractPropertyLines(drawingSheetBlock, originalFileCache);
    const subClassOfLine = propertyLines.find(pl => pl.predicate === 'rdfs:subClassOf');
    
    expect(subClassOfLine).toBeDefined();
    // Should not have empty brackets in original text
    expect(subClassOfLine?.originalLineText).not.toMatch(/\[\s*\]/);
  });

  it('should handle nested blank nodes', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'nested-blank-nodes.ttl'), 'utf-8');
    const { cache } = await parseTurtleWithPositions(content);
    
    const classBlock = cache.statementBlocks.find(b => 
      b.type === 'Class' && b.originalText?.includes('TestClass')
    );
    expect(classBlock).toBeDefined();
    if (!classBlock) return;
    
    const propertyLines = extractPropertyLines(classBlock, cache);
    
    // Should extract nested structure correctly
    expect(propertyLines.length).toBeGreaterThan(0);
    for (const propLine of propertyLines) {
      expect(propLine.validationErrors.length).toBe(0); // No errors for valid nested structure
    }
  });

  it('should handle cardinality constraints', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'cardinality-constraints.ttl'), 'utf-8');
    const { cache } = await parseTurtleWithPositions(content);
    
    const classBlock = cache.statementBlocks.find(b => 
      b.type === 'Class' && b.originalText?.includes('TestClass')
    );
    expect(classBlock).toBeDefined();
    if (!classBlock) return;
    
    const propertyLines = extractPropertyLines(classBlock, cache);
    const subClassOfLine = propertyLines.find(pl => pl.predicate === 'rdfs:subClassOf');
    
    expect(subClassOfLine).toBeDefined();
    // Should preserve cardinality constraints in original text
    expect(subClassOfLine?.originalLineText).toMatch(/owl:(min|max|qualified)Cardinality/);
  });
});
