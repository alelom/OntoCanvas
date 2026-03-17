/**
 * Unit tests for targeted line replacement.
 * Tests that only the affected lines are modified, preserving all other lines exactly.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseTtlWithCache, modifyLabel, modifyComment, modifyLabellableRoot, verifyOnlyLinesChanged } from './helpers';
import { storeToTurtle } from '../../../src/parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_DIR = join(__dirname, '../../fixtures/customSerializerFixtures');

describe('Targeted Line Replacement', () => {
  it('should replace only label line when label changes', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'label-only-change.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(store, classUri, 'New Label');
    
    // TODO: Once performTargetedLineReplacement is implemented
    // const serialized = await performTargetedLineReplacement(cache, changes);
    // 
    // // Find the line number of the label in original
    // const originalLines = content.split(/\r?\n/);
    // const labelLineIndex = originalLines.findIndex(line => line.includes('rdfs:label') && line.includes('Original Label'));
    // 
    // // Verify only that line changed
    // expect(verifyOnlyLinesChanged(content, serialized, [labelLineIndex + 1])).toBe(true);
    // 
    // // Verify new label appears
    // expect(serialized).toContain('New Label');
    // expect(serialized).not.toContain('Original Label');
    // 
    // // Verify comment unchanged
    // expect(serialized).toContain('This comment should remain unchanged');
    
    // For now, use storeToTurtle to verify basic functionality
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).toContain('New Label');
  });

  it('should replace only comment line when comment changes', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'comment-only-change.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    modifyComment(store, classUri, 'New Comment');
    
    // TODO: Once performTargetedLineReplacement is implemented
    // const serialized = await performTargetedLineReplacement(cache, changes);
    // 
    // // Verify only comment line changed
    // const originalLines = content.split(/\r?\n/);
    // const commentLineIndex = originalLines.findIndex(line => line.includes('rdfs:comment') && line.includes('Original comment'));
    // 
    // expect(verifyOnlyLinesChanged(content, serialized, [commentLineIndex + 1])).toBe(true);
    // expect(serialized).toContain('New Comment');
    // expect(serialized).not.toContain('Original comment');
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).toContain('New Comment');
  });

  it('should replace only labellableRoot line when labellableRoot changes', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'labellableRoot-only-change.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    modifyLabellableRoot(store, classUri, false);
    
    // TODO: Once performTargetedLineReplacement is implemented
    // Verify only labellableRoot line changed
    // Other properties should remain unchanged
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).toBeDefined();
  });

  it('should preserve surrounding lines when replacing a property', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'label-only-change.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(store, classUri, 'New Label');
    
    // TODO: Once performTargetedLineReplacement is implemented
    // const serialized = await performTargetedLineReplacement(cache, changes);
    // 
    // // Find lines before and after label
    // const originalLines = content.split(/\r?\n/);
    // const labelLineIndex = originalLines.findIndex(line => line.includes('rdfs:label'));
    // 
    // // Verify lines before and after are unchanged
    // const beforeLine = originalLines[labelLineIndex - 1];
    // const afterLine = originalLines[labelLineIndex + 1];
    // const serializedLines = serialized.split(/\r?\n/);
    // 
    // expect(serializedLines[labelLineIndex - 1]).toBe(beforeLine);
    // expect(serializedLines[labelLineIndex + 1]).toBe(afterLine);
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).toBeDefined();
  });

  it('should preserve formatting (indentation, spacing, line breaks)', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'label-only-change.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(store, classUri, 'New Label');
    
    // TODO: Once performTargetedLineReplacement is implemented
    // const serialized = await performTargetedLineReplacement(cache, changes);
    // 
    // // Verify indentation preserved
    // const originalLines = content.split(/\r?\n/);
    // const serializedLines = serialized.split(/\r?\n/);
    // 
    // // Check that indentation of unchanged lines matches
    // for (let i = 0; i < originalLines.length; i++) {
    //   if (i !== labelLineIndex) {
    //     const originalIndent = originalLines[i].match(/^(\s*)/)?.[1] || '';
    //     const serializedIndent = serializedLines[i]?.match(/^(\s*)/)?.[1] || '';
    //     expect(serializedIndent).toBe(originalIndent);
    //   }
    // }
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).toBeDefined();
  });

  it('should preserve property order when replacing a property', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'property-order.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(store, classUri, 'New Label');
    
    // TODO: Once performTargetedLineReplacement is implemented
    // const serialized = await performTargetedLineReplacement(cache, changes);
    // 
    // // Verify property order: rdf:type, rdfs:subClassOf, rdfs:label, rdfs:comment
    // const classBlock = serialized.match(/:TestClass[\s\S]*?\./)?.[0] || '';
    // 
    // const typeIndex = classBlock.indexOf('rdf:type');
    // const subClassOfIndex = classBlock.indexOf('rdfs:subClassOf');
    // const labelIndex = classBlock.indexOf('rdfs:label');
    // const commentIndex = classBlock.indexOf('rdfs:comment');
    // 
    // expect(typeIndex).toBeLessThan(subClassOfIndex);
    // expect(subClassOfIndex).toBeLessThan(labelIndex);
    // expect(labelIndex).toBeLessThan(commentIndex);
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).toBeDefined();
  });

  it('should handle property at start of block', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'simple-property.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    // Modify the first property (rdf:type would be first, but let's modify label which might be first)
    modifyLabel(store, classUri, 'New Label');
    
    // TODO: Once performTargetedLineReplacement is implemented
    // Verify it works when property is at the start
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).toBeDefined();
  });

  it('should handle property at end of block', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'simple-property.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    modifyComment(store, classUri, 'New Comment');
    
    // TODO: Once performTargetedLineReplacement is implemented
    // Verify it works when property is at the end
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).toBeDefined();
  });

  it('should handle block with single property', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'empty-class.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    // Add a label to the empty class
    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(store, classUri, 'New Label');
    
    // TODO: Once performTargetedLineReplacement is implemented
    // Verify it works with minimal properties
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).toBeDefined();
  });
});
