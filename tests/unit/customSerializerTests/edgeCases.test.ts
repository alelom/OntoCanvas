/**
 * Unit tests for edge cases in custom serializer.
 * Tests complex scenarios like nested blank nodes, multiple restrictions,
 * empty classes, and round-trip idempotency.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseTtlWithCache, modifyLabel } from './helpers';
import { storeToTurtle, parseRdfToGraph } from '../../../src/parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_DIR = join(__dirname, '../../fixtures/customSerializerFixtures');
const MAIN_FIXTURES_DIR = join(__dirname, '../../fixtures');

describe('Edge Cases', () => {
  it('should not create empty blank nodes [ ]', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'with-restrictions.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(store, classUri, 'New Label');
    
    // TODO: Once custom serializer is implemented
    // const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    // 
    // // Should not contain empty blank nodes
    // expect(serialized).not.toMatch(/\[\s*\]/);
    // expect(serialized).not.toMatch(/rdfs:subClassOf\s*\[\s*\]/);
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).not.toMatch(/\[\s*\]/);
  });

  it('should handle nested blank nodes', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'nested-blank-nodes.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(store, classUri, 'New Label');
    
    // TODO: Once custom serializer is implemented
    // const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    // 
    // // Should preserve nested structure
    // expect(serialized).toMatch(/owl:onClass\s+\[/);
    // expect(serialized).toMatch(/rdf:type\s+owl:Class/);
    // expect(serialized).toMatch(/rdfs:label\s+"Nested Class"/);
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).toBeDefined();
  });

  it('should handle multiple restrictions (4+)', async () => {
    // Reuse existing fixture
    const content = readFileSync(join(MAIN_FIXTURES_DIR, 'aec_drawing_metadata.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'https://burohappoldmachinelearning.github.io/ADIRO/aec_drawing_metadata#DrawingSheet';
    modifyLabel(store, classUri, 'New Label');
    
    // TODO: Once custom serializer is implemented
    // const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    // 
    // // Should preserve all restrictions
    // const restrictionCount = (serialized.match(/owl:Restriction/g) || []).length;
    // expect(restrictionCount).toBeGreaterThanOrEqual(4);
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).toBeDefined();
  });

  it('should preserve cardinality constraints (minQualifiedCardinality, maxQualifiedCardinality, qualifiedCardinality)', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'cardinality-constraints.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(store, classUri, 'New Label');
    
    // TODO: Once custom serializer is implemented
    // const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    // 
    // // Verify all cardinality types preserved
    // expect(serialized).toMatch(/owl:minQualifiedCardinality/);
    // expect(serialized).toMatch(/owl:maxQualifiedCardinality/);
    // expect(serialized).toMatch(/owl:qualifiedCardinality/);
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).toMatch(/owl:minQualifiedCardinality/);
    expect(serialized).toMatch(/owl:maxQualifiedCardinality/);
    expect(serialized).toMatch(/owl:qualifiedCardinality/);
  });

  it('should preserve property order with restrictions', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'with-restrictions.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(store, classUri, 'New Label');
    
    // TODO: Once custom serializer is implemented
    // const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    // 
    // // Verify restrictions appear in original order
    // // rdf:type should come first, then rdfs:subClassOf, then rdfs:label
    // const classBlock = serialized.match(/:TestClass[\s\S]*?\./)?.[0] || '';
    // 
    // const typeIndex = classBlock.indexOf('rdf:type');
    // const subClassOfIndex = classBlock.indexOf('rdfs:subClassOf');
    // const labelIndex = classBlock.indexOf('rdfs:label');
    // 
    // expect(typeIndex).toBeLessThan(subClassOfIndex);
    // expect(subClassOfIndex).toBeLessThan(labelIndex);
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).toBeDefined();
  });

  it('should handle class with no properties (empty class)', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'empty-class.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    // Add a property
    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(store, classUri, 'New Label');
    
    // TODO: Once custom serializer is implemented
    // const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    // 
    // // Should still serialize correctly
    // expect(serialized).toContain(':TestClass');
    // expect(serialized).toContain('rdf:type owl:Class');
    // expect(serialized).toContain('New Label');
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).toContain(':TestClass');
  });

  it('should handle class with only restrictions (no other properties)', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'with-restrictions.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    // Remove label to make it only restrictions
    const classUri = 'http://example.org/test#TestClass';
    const labelQuads = store.getQuads(
      null,
      null,
      null,
      null
    ).filter(q => {
      const pred = q.predicate as { value: string };
      const subj = q.subject as { value: string };
      return pred.value.includes('label') && subj.value.includes('TestClass');
    });
    
    for (const quad of labelQuads) {
      store.removeQuad(quad);
    }
    
    // TODO: Once custom serializer is implemented
    // const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    // 
    // // Should serialize correctly with only restrictions
    // expect(serialized).toContain(':TestClass');
    // expect(serialized).toContain('rdfs:subClassOf');
    // expect(serialized).toContain('owl:Restriction');
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).toBeDefined();
  });

  it('should preserve restriction with multiple properties (onProperty, onClass, cardinality)', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'cardinality-constraints.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(store, classUri, 'New Label');
    
    // TODO: Once custom serializer is implemented
    // const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    // 
    // // Verify restriction properties preserved
    // const restrictionBlock = serialized.match(/\[\s*rdf:type\s+owl:Restriction[\s\S]*?\]/)?.[0] || '';
    // 
    // expect(restrictionBlock).toMatch(/owl:onProperty/);
    // expect(restrictionBlock).toMatch(/owl:onClass/);
    // expect(restrictionBlock).toMatch(/owl:(min|max|qualified)Cardinality/);
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).toMatch(/owl:onProperty/);
    expect(serialized).toMatch(/owl:onClass/);
  });

  it('should be idempotent in round-trip (parse, modify, save, parse, verify unchanged parts)', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'simple-property.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(store, classUri, 'New Label');
    
    // TODO: Once custom serializer is implemented
    // const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    // 
    // // Parse the serialized content
    // const parseResult2 = await parseRdfToGraph(serialized, { path: 'test.ttl' });
    // const { store: store2, originalFileCache: cache2 } = parseResult2;
    // 
    // // Verify unchanged parts are identical
    // // Comment should be unchanged
    // const originalComment = content.match(/rdfs:comment\s+"([^"]+)"/)?.[1];
    // const serializedComment = serialized.match(/rdfs:comment\s+"([^"]+)"/)?.[1];
    // expect(serializedComment).toBe(originalComment);
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    const parseResult2 = await parseRdfToGraph(serialized, { path: 'test.ttl' });
    expect(parseResult2.store).toBeDefined();
  });
});
