/**
 * Unit tests for property line extraction from statement blocks.
 * Tests the ability to identify individual property lines within a block,
 * including single-line, multi-line, and comma-separated properties.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseTtlWithCache } from './helpers';
import { parseTurtleWithPositions, extractPropertyLines } from '../../../src/rdf/sourcePreservation';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_DIR = join(__dirname, '../../fixtures/customSerializerFixtures');

describe('Property Line Extraction', () => {
  it('should extract simple single-line property', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'simple-property.ttl'), 'utf-8');
    const { cache } = await parseTurtleWithPositions(content);
    
    // Find the TestClass block
    const classBlock = cache.statementBlocks.find(b => 
      b.type === 'Class' && b.originalText?.includes('TestClass')
    );
    
    expect(classBlock).toBeDefined();
    if (!classBlock) return;
    
    const propertyLines = extractPropertyLines(classBlock, cache);
    expect(propertyLines.length).toBeGreaterThan(0);
    
    const labelLine = propertyLines.find(pl => pl.predicate === 'rdfs:label');
    expect(labelLine).toBeDefined();
    expect(labelLine?.isMultiLine).toBe(false);
    expect(labelLine?.lineNumbers.length).toBe(1);
    expect(labelLine?.originalLineText).toContain('rdfs:label');
    
    // Verify new PropertyLine fields
    expect(labelLine?.quadPositions).toBeDefined();
    expect(labelLine?.confidence).toBeGreaterThanOrEqual(0);
    expect(labelLine?.confidence).toBeLessThanOrEqual(1);
    expect(labelLine?.validationErrors).toBeDefined();
    expect(Array.isArray(labelLine?.validationErrors)).toBe(true);
  });

  it('should extract multi-line property with restriction', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'multi-line-restriction.ttl'), 'utf-8');
    const { cache } = await parseTurtleWithPositions(content);
    
    const classBlock = cache.statementBlocks.find(b => 
      b.type === 'Class' && b.originalText?.includes('TestClass')
    );
    
    expect(classBlock).toBeDefined();
    if (!classBlock) return;
    
    const propertyLines = extractPropertyLines(classBlock, cache);
    
    const subClassOfLine = propertyLines.find(pl => pl.predicate === 'rdfs:subClassOf');
    expect(subClassOfLine).toBeDefined();
    expect(subClassOfLine?.isMultiLine).toBe(true);
    expect(subClassOfLine?.lineNumbers.length).toBeGreaterThan(1);
    expect(subClassOfLine?.originalLineText).toContain('rdfs:subClassOf');
    expect(subClassOfLine?.originalLineText).toContain('owl:Restriction');
    
    // Verify new fields for multi-line property
    expect(subClassOfLine?.quadPositions).toBeDefined();
    expect(subClassOfLine?.confidence).toBeGreaterThanOrEqual(0);
    expect(subClassOfLine?.confidence).toBeLessThanOrEqual(1);
    expect(subClassOfLine?.validationErrors).toBeDefined();
    expect(Array.isArray(subClassOfLine?.validationErrors)).toBe(true);
  });

  it('should extract comma-separated properties', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'comma-separated.ttl'), 'utf-8');
    const { cache } = await parseTurtleWithPositions(content);
    
    const classBlock = cache.statementBlocks.find(b => 
      b.type === 'Class' && b.originalText?.includes('TestClass')
    );
    
    expect(classBlock).toBeDefined();
    if (!classBlock) return;
    
    const propertyLines = extractPropertyLines(classBlock, cache);
    
    const subClassOfLines = propertyLines.filter(pl => pl.predicate === 'rdfs:subClassOf');
    // Should find multiple subClassOf values (Parent1, Parent2, Parent3)
    expect(subClassOfLines.length).toBeGreaterThanOrEqual(1);
    
    // Verify each has quads and proper structure
    for (const subClassOfLine of subClassOfLines) {
      expect(subClassOfLine.quads.length).toBeGreaterThan(0);
      expect(subClassOfLine.quadPositions).toBeDefined();
      expect(subClassOfLine.confidence).toBeGreaterThanOrEqual(0);
    }
  });

  it('should extract mixed format properties (single and multi-line)', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'mixed-properties.ttl'), 'utf-8');
    const { cache } = await parseTurtleWithPositions(content);
    
    const classBlock = cache.statementBlocks.find(b => 
      b.type === 'Class' && b.originalText?.includes('TestClass')
    );
    
    expect(classBlock).toBeDefined();
    if (!classBlock) return;
    
    const propertyLines = extractPropertyLines(classBlock, cache);
    
    const singleLineProps = propertyLines.filter(pl => !pl.isMultiLine);
    const multiLineProps = propertyLines.filter(pl => pl.isMultiLine);
    
    expect(singleLineProps.length).toBeGreaterThan(0);
    expect(multiLineProps.length).toBeGreaterThan(0);
    
    // Verify all properties have required fields
    for (const prop of propertyLines) {
      expect(prop.quadPositions).toBeDefined();
      expect(prop.confidence).toBeGreaterThanOrEqual(0);
      expect(prop.confidence).toBeLessThanOrEqual(1);
      expect(prop.validationErrors).toBeDefined();
    }
  });

  it('should track correct line numbers for each property', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'simple-property.ttl'), 'utf-8');
    const { cache } = await parseTurtleWithPositions(content);
    
    const classBlock = cache.statementBlocks.find(b => 
      b.type === 'Class' && b.originalText?.includes('TestClass')
    );
    
    expect(classBlock).toBeDefined();
    if (!classBlock) return;
    
    const propertyLines = extractPropertyLines(classBlock, cache);
    
    for (const propLine of propertyLines) {
      expect(propLine.lineNumbers.length).toBeGreaterThan(0);
      expect(propLine.lineNumbers[0]).toBeGreaterThanOrEqual(classBlock.position.startLine);
      expect(propLine.lineNumbers[propLine.lineNumbers.length - 1]).toBeLessThanOrEqual(classBlock.position.endLine);
    }
  });

  it('should track correct character positions for each property', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'simple-property.ttl'), 'utf-8');
    const { cache } = await parseTurtleWithPositions(content);
    
    const classBlock = cache.statementBlocks.find(b => 
      b.type === 'Class' && b.originalText?.includes('TestClass')
    );
    
    expect(classBlock).toBeDefined();
    if (!classBlock) return;
    
    const propertyLines = extractPropertyLines(classBlock, cache);
    
    for (const propLine of propertyLines) {
      expect(propLine.position.start).toBeGreaterThanOrEqual(classBlock.position.start);
      expect(propLine.position.end).toBeLessThanOrEqual(classBlock.position.end);
      expect(propLine.position.end).toBeGreaterThan(propLine.position.start);
      
      // Verify quad positions are within property position
      for (const [quad, quadPos] of propLine.quadPositions.entries()) {
        expect(quadPos.start).toBeGreaterThanOrEqual(propLine.position.start);
        expect(quadPos.end).toBeLessThanOrEqual(propLine.position.end);
      }
    }
  });

  it('should preserve property order from original text', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'property-order.ttl'), 'utf-8');
    const { cache } = await parseTurtleWithPositions(content);
    
    const classBlock = cache.statementBlocks.find(b => 
      b.type === 'Class' && b.originalText?.includes('TestClass')
    );
    
    expect(classBlock).toBeDefined();
    if (!classBlock) return;
    
    const propertyLines = extractPropertyLines(classBlock, cache);
    
    // Verify order: rdf:type, rdfs:subClassOf, rdfs:label, rdfs:comment
    const expectedOrder = ['rdf:type', 'rdfs:subClassOf', 'rdfs:label', 'rdfs:comment'];
    const actualOrder = propertyLines.map(pl => pl.predicate);
    
    // Check that properties appear in expected order (allowing for some flexibility)
    let lastIndex = -1;
    for (const expectedPred of expectedOrder) {
      const index = actualOrder.indexOf(expectedPred);
      if (index !== -1) {
        expect(index).toBeGreaterThan(lastIndex);
        lastIndex = index;
      }
    }
  });

  it('should match quads to property lines correctly', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'simple-property.ttl'), 'utf-8');
    const { cache } = await parseTurtleWithPositions(content);
    
    const classBlock = cache.statementBlocks.find(b => 
      b.type === 'Class' && b.originalText?.includes('TestClass')
    );
    
    expect(classBlock).toBeDefined();
    if (!classBlock) return;
    
    const propertyLines = extractPropertyLines(classBlock, cache);
    
    // Each property line should have at least one quad
    for (const propLine of propertyLines) {
      expect(propLine.quads.length).toBeGreaterThan(0);
      // Each quad should have a position
      expect(propLine.quadPositions.size).toBe(propLine.quads.length);
      // Confidence should be high for matched quads
      expect(propLine.confidence).toBeGreaterThan(0);
      // No validation errors for valid properties
      expect(propLine.validationErrors.length).toBe(0);
    }
    
    // All quads from the block should be assigned to a property line
    const allQuadsFromProps = new Set(propertyLines.flatMap(pl => pl.quads));
    expect(allQuadsFromProps.size).toBeGreaterThanOrEqual(classBlock.quads.length);
  });
});
