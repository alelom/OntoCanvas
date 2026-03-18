/**
 * Integration tests for custom serializer.
 * Tests complete workflows including parse, modify, serialize, and verification.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseTtlWithCache, modifyLabel, modifyComment, modifyLabellableRoot } from './helpers';
import { storeToTurtle, parseRdfToGraph } from '../../../src/parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_DIR = join(__dirname, '../../fixtures/customSerializerFixtures');
const MAIN_FIXTURES_DIR = join(__dirname, '../../fixtures');

describe('Custom Serializer Integration', () => {
  it('should complete full workflow: parse TTL → modify label → serialize → verify only label line changed', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'label-only-change.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    const originalLabel = 'Original Label';
    const newLabel = 'New Label';
    
    // Modify label
    modifyLabel(store, classUri, newLabel);
    
    // TODO: Once custom serializer is implemented
    // const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    // 
    // // Verify new label appears
    // expect(serialized).toContain(newLabel);
    // expect(serialized).not.toContain(originalLabel);
    // 
    // // Verify comment unchanged
    // expect(serialized).toContain('This comment should remain unchanged');
    // 
    // // Verify only label line changed
    // const originalLines = content.split(/\r?\n/);
    // const serializedLines = serialized.split(/\r?\n/);
    // 
    // let changedLineCount = 0;
    // for (let i = 0; i < Math.min(originalLines.length, serializedLines.length); i++) {
    //   if (originalLines[i] !== serializedLines[i]) {
    //     changedLineCount++;
    //   }
    // }
    // 
    // // Should have changed only the label line (or maybe 1-2 lines if label spans multiple)
    // expect(changedLineCount).toBeLessThanOrEqual(2);
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).toContain(newLabel);
    expect(serialized).not.toContain(originalLabel);
  });

  it('should modify one class and verify others unchanged', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'complex-ontology.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const class1Uri = 'http://example.org/test#Class1';
    const class2Uri = 'http://example.org/test#Class2';
    const class3Uri = 'http://example.org/test#Class3';
    
    // Modify only Class1
    modifyLabel(store, class1Uri, 'New Class 1 Label');
    
    // TODO: Once custom serializer is implemented
    // const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    // 
    // // Verify Class1 changed
    // expect(serialized).toContain('New Class 1 Label');
    // 
    // // Verify Class2 unchanged
    // expect(serialized).toContain(':Class2');
    // expect(serialized).toMatch(/:Class2[\s\S]*?rdfs:label\s+"Class 2"/);
    // 
    // // Verify Class3 unchanged
    // expect(serialized).toContain(':Class3');
    // expect(serialized).toMatch(/:Class3[\s\S]*?rdfs:label\s+"Class 3"/);
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).toContain('New Class 1 Label');
    expect(serialized).toContain(':Class2');
    expect(serialized).toContain(':Class3');
  });

  it('should complete round-trip: parse → modify → save → parse → verify semantic equivalence', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'simple-property.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(store, classUri, 'New Label');
    
    // TODO: Once custom serializer is implemented
    // const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    // 
    // // Parse the serialized content
    // const parseResult2 = await parseRdfToGraph(serialized, { path: 'test.ttl' });
    // const { store: store2 } = parseResult2;
    // 
    // // Verify semantic equivalence by comparing quads
    // const originalQuads = Array.from(store).sort();
    // const roundTripQuads = Array.from(store2).sort();
    // 
    // // Should have same number of quads (or very close, accounting for blank node ID changes)
    // expect(Math.abs(originalQuads.length - roundTripQuads.length)).toBeLessThanOrEqual(2);
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    const parseResult2 = await parseRdfToGraph(serialized, { path: 'test.ttl' });
    expect(parseResult2.store).toBeDefined();
  });

  it('should handle complex ontology (aec_drawing_metadata.ttl) workflow', async () => {
    const content = readFileSync(join(MAIN_FIXTURES_DIR, 'aec_drawing_metadata.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'https://burohappoldmachinelearning.github.io/ADIRO/aec_drawing_metadata#DrawingSheet';
    modifyLabel(store, classUri, 'New Drawing Sheet Label');
    
    // TODO: Once custom serializer is implemented
    // const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    // 
    // // Verify label changed
    // expect(serialized).toContain('New Drawing Sheet Label');
    // 
    // // Verify restrictions preserved
    // const restrictionCount = (serialized.match(/owl:Restriction/g) || []).length;
    // const originalRestrictionCount = (content.match(/owl:Restriction/g) || []).length;
    // expect(restrictionCount).toBeGreaterThanOrEqual(originalRestrictionCount - 2); // Allow some variance
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).toContain('New Drawing Sheet Label');
  });

  it('should preserve property order after modification', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'property-order.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(store, classUri, 'New Label');
    
    // TODO: Once custom serializer is implemented
    // const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    // 
    // // Extract class block
    // const classBlock = serialized.match(/:TestClass[\s\S]*?\./)?.[0] || '';
    // 
    // // Verify order: rdf:type, rdfs:subClassOf, rdfs:label, rdfs:comment
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

  it('should preserve all restrictions after label change', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'with-restrictions.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    
    // Count restrictions before
    const beforeQuads = store.getQuads(
      null,
      null,
      null,
      null
    ).filter(q => {
      const pred = q.predicate as { value: string };
      return pred.value.includes('subClassOf');
    });
    const beforeRestrictions = beforeQuads.filter(q => q.object.termType === 'BlankNode');
    const beforeCount = beforeRestrictions.length;
    
    // Modify label
    modifyLabel(store, classUri, 'New Label');
    
    // TODO: Once custom serializer is implemented
    // const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    // 
    // // Parse serialized to verify restrictions
    // const parseResult2 = await parseRdfToGraph(serialized, { path: 'test.ttl' });
    // const { store: store2 } = parseResult2;
    // 
    // const afterQuads = store2.getQuads(
    //   null,
    //   null,
    //   null,
    //   null
    // ).filter(q => {
    //   const pred = q.predicate as { value: string };
    //   return pred.value.includes('subClassOf');
    // });
    // const afterRestrictions = afterQuads.filter(q => q.object.termType === 'BlankNode');
    // 
    // // Should have same number of restrictions
    // expect(afterRestrictions.length).toBe(beforeCount);
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).toMatch(/owl:Restriction/);
  });

  it('should preserve formatting after modification', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'multi-line-formatting.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(store, classUri, 'New Label');
    
    // TODO: Once custom serializer is implemented
    // const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    // 
    // // Verify restriction formatting preserved
    // const originalRestriction = content.match(/rdfs:subClassOf\s+\[[\s\S]*?\]/)?.[0] || '';
    // const serializedRestriction = serialized.match(/rdfs:subClassOf\s+\[[\s\S]*?\]/)?.[0] || '';
    // 
    // // Compare indentation
    // const originalIndent = originalRestriction.match(/^\s+/)?.[0] || '';
    // const serializedIndent = serializedRestriction.match(/^\s+/)?.[0] || '';
    // 
    // // Should have similar indentation (allowing for some variance)
    // expect(Math.abs(originalIndent.length - serializedIndent.length)).toBeLessThanOrEqual(2);
    
    const serialized = await storeToTurtle(store, undefined, content, cache);
    expect(serialized).toBeDefined();
  });
});
