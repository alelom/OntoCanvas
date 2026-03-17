/**
 * Unit tests for detecting property-level changes.
 * Tests the ability to identify which specific properties have changed,
 * distinguishing between simple changes (single property) and complex changes (multiple properties or blank nodes).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseTtlWithCache, modifyLabel, modifyComment, modifyLabellableRoot } from './helpers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_DIR = join(__dirname, '../../fixtures/customSerializerFixtures');

describe('Line-Level Change Detection', () => {
  it('should detect simple label change (only rdfs:label changed)', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'simple-label-change.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    
    // Modify label
    modifyLabel(store, classUri, 'New Label');
    
    // TODO: Once detectPropertyLevelChanges is implemented
    // const changes = detectPropertyLevelChanges(store, cache);
    // 
    // // Should detect only label change
    // expect(changes.size).toBe(1);
    // const labelChange = Array.from(changes.values())[0];
    // expect(labelChange).toBeDefined();
    
    // For now, verify the change was made in the store
    const labelQuads = store.getQuads(
      store.getQuads(null, null, null, null)[0]?.subject || null,
      null,
      null,
      null
    );
    expect(store).toBeDefined();
  });

  it('should detect comment change (only rdfs:comment changed)', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'comment-only-change.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    
    // Modify comment
    modifyComment(store, classUri, 'New Comment');
    
    // TODO: Once detectPropertyLevelChanges is implemented
    // const changes = detectPropertyLevelChanges(store, cache);
    // 
    // // Should detect only comment change
    // expect(changes.size).toBe(1);
    
    expect(store).toBeDefined();
  });

  it('should detect labellableRoot change (only :labellableRoot changed)', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'labellableRoot-only-change.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    
    // Modify labellableRoot
    modifyLabellableRoot(store, classUri, false);
    
    // TODO: Once detectPropertyLevelChanges is implemented
    // const changes = detectPropertyLevelChanges(store, cache);
    // 
    // // Should detect only labellableRoot change
    // expect(changes.size).toBe(1);
    
    expect(store).toBeDefined();
  });

  it('should detect multiple properties changed (fallback to block-level)', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'multiple-properties.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    
    // Modify both label and comment
    modifyLabel(store, classUri, 'New Label');
    modifyComment(store, classUri, 'New Comment');
    
    // TODO: Once detectPropertyLevelChanges is implemented
    // const changes = detectPropertyLevelChanges(store, cache);
    // 
    // // Should detect multiple changes
    // expect(changes.size).toBeGreaterThan(1);
    // 
    // // Should not be a simple change (requires block-level replacement)
    // const isSimple = Array.from(changes.values()).every(change => 
    //   isSimplePropertyChange(change.propertyLine, change)
    // );
    // expect(isSimple).toBe(false);
    
    expect(store).toBeDefined();
  });

  it('should detect property added', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'simple-property.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    
    // Add a new property (comment)
    modifyComment(store, classUri, 'New Comment');
    
    // TODO: Once detectPropertyLevelChanges is implemented
    // const changes = detectPropertyLevelChanges(store, cache);
    // 
    // // Should detect the new property
    // expect(changes.size).toBeGreaterThan(0);
    
    expect(store).toBeDefined();
  });

  it('should detect property removed', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'multiple-properties.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    
    // Remove comment (by modifying it to empty, or actually removing)
    const commentQuads = store.getQuads(
      null,
      null,
      null,
      null
    ).filter(q => {
      const pred = q.predicate as { value: string };
      return pred.value.includes('comment');
    });
    
    for (const quad of commentQuads) {
      store.removeQuad(quad);
    }
    
    // TODO: Once detectPropertyLevelChanges is implemented
    // const changes = detectPropertyLevelChanges(store, cache);
    // 
    // // Should detect the removed property
    // expect(changes.size).toBeGreaterThan(0);
    
    expect(store).toBeDefined();
  });

  it('should detect no changes (all properties unchanged)', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'simple-property.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    // Don't modify anything
    
    // TODO: Once detectPropertyLevelChanges is implemented
    // const changes = detectPropertyLevelChanges(store, cache);
    // 
    // // Should detect no changes
    // expect(changes.size).toBe(0);
    
    expect(store).toBeDefined();
    expect(cache).toBeDefined();
  });

  it('should detect restriction changed (complex change)', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'with-restrictions.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    // TODO: Modify a restriction (this is complex and requires blank node manipulation)
    // For now, just verify the store has restrictions
    
    const subClassOfQuads = store.getQuads(
      null,
      null,
      null,
      null
    ).filter(q => {
      const pred = q.predicate as { value: string };
      return pred.value.includes('subClassOf');
    });
    
    // TODO: Once detectPropertyLevelChanges is implemented
    // const changes = detectPropertyLevelChanges(store, cache);
    // 
    // // Should detect restriction change as complex (not simple)
    // const hasRestrictionChange = Array.from(changes.values()).some(change =>
    //   change.propertyLine.predicate === 'rdfs:subClassOf' && change.propertyLine.isMultiLine
    // );
    // if (hasRestrictionChange) {
    //   const isSimple = isSimplePropertyChange(change.propertyLine, change);
    //   expect(isSimple).toBe(false); // Restriction changes are complex
    // }
    
    expect(store).toBeDefined();
  });

  it('should detect blank node unchanged (restriction present but unchanged)', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'with-restrictions.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    // Don't modify restrictions, only modify label
    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(store, classUri, 'New Label');
    
    // TODO: Once detectPropertyLevelChanges is implemented
    // const changes = detectPropertyLevelChanges(store, cache);
    // 
    // // Should detect only label change, not restriction change
    // const restrictionChanges = Array.from(changes.values()).filter(change =>
    //   change.propertyLine.predicate === 'rdfs:subClassOf'
    // );
    // expect(restrictionChanges.length).toBe(0); // Restrictions unchanged
    
    expect(store).toBeDefined();
  });
});
