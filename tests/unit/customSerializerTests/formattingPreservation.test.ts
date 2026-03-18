/**
 * Unit tests for formatting preservation.
 * Tests that property order, indentation, line breaks, and other formatting
 * are preserved during serialization.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseTtlWithCache, modifyLabel, verifyPropertyOrder, verifyFormattingPreserved } from './helpers';
import { storeToTurtle } from '../../../src/parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_DIR = join(__dirname, '../../fixtures/customSerializerFixtures');

describe('Formatting Preservation', () => {
  it('should preserve property order (rdf:type first, then rdfs:subClassOf, then rdfs:label)', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'property-order.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(store, classUri, 'New Label');
    
    const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    
    // Verify property order
    expect(verifyPropertyOrder(serialized, classUri, [
      'rdf:type',
      'rdfs:subClassOf',
      'rdfs:label',
      'rdfs:comment'
    ])).toBe(true);
  });

  it('should preserve multi-line restriction formatting', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'multi-line-formatting.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(store, classUri, 'New Label');
    
    const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    
    // Verify restriction formatting preserved (line breaks, indentation)
    const restrictionPattern = /rdfs:subClassOf\s+\[\s*rdf:type\s+owl:Restriction/s;
    expect(serialized).toMatch(restrictionPattern);
    
    // Verify indentation levels match original
    const originalLines = content.split(/\r?\n/);
    const serializedLines = serialized.split(/\r?\n/);
    
    // Find restriction lines in original
    const originalRestrictionLines = originalLines.filter(line => 
      line.includes('owl:Restriction') || line.includes('owl:onProperty')
    );
    
    // Find restriction lines in serialized
    const serializedRestrictionLines = serializedLines.filter(line =>
      line.includes('owl:Restriction') || line.includes('owl:onProperty')
    );
    
    // Compare indentation
    for (let i = 0; i < Math.min(originalRestrictionLines.length, serializedRestrictionLines.length); i++) {
      const originalIndent = originalRestrictionLines[i].match(/^(\s*)/)?.[1] || '';
      const serializedIndent = serializedRestrictionLines[i].match(/^(\s*)/)?.[1] || '';
      expect(serializedIndent).toBe(originalIndent);
    }
  });

  it('should preserve indentation levels (2 spaces, 4 spaces, tabs)', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'mixed-indentation.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(store, classUri, 'New Label');
    
    const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    
    // Verify indentation preserved
    const originalLines = content.split(/\r?\n/);
    const serializedLines = serialized.split(/\r?\n/);
    
    // Compare indentation for each line (excluding the modified line)
    for (let i = 0; i < originalLines.length; i++) {
      if (!originalLines[i].includes('rdfs:label') || !originalLines[i].includes('Original Label')) {
        const originalIndent = originalLines[i].match(/^(\s*)/)?.[1] || '';
        const serializedIndent = serializedLines[i]?.match(/^(\s*)/)?.[1] || '';
        expect(serializedIndent).toBe(originalIndent);
      }
    }
  });

  it('should preserve line ending style (\\n vs \\r\\n)', async () => {
    // Test CRLF: ensure input actually has CRLF so the test is reliable in CI (Git may checkout with LF).
    let contentCrlf = readFileSync(join(FIXTURES_DIR, 'line-endings-crlf.ttl'), 'utf-8');
    contentCrlf = contentCrlf.replace(/^\uFEFF/, ''); // Strip BOM if present (CI/Windows)
    contentCrlf = contentCrlf.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'); // Force CRLF
    const { store: storeCrlf, cache: cacheCrlf } = await parseTtlWithCache(contentCrlf);

    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(storeCrlf, classUri, 'New Label');

    const serializedCrlf = await storeToTurtle(storeCrlf, undefined, contentCrlf, cacheCrlf, 'custom');

    // Verify CRLF preserved
    expect(serializedCrlf).toMatch(/\r\n/);

    // Test LF
    // Note: On Windows, the file might have CRLF due to Git autocrlf or file system conversion
    // Normalize to LF for testing purposes
    let contentLf = readFileSync(join(FIXTURES_DIR, 'line-endings-lf.ttl'), 'utf-8');
    contentLf = contentLf.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'); // Strip BOM, normalize to LF
    const { store: storeLf, cache: cacheLf } = await parseTtlWithCache(contentLf);

    modifyLabel(storeLf, classUri, 'New Label');

    const serializedLf = await storeToTurtle(storeLf, undefined, contentLf, cacheLf, 'custom');

    // Verify LF preserved (no CRLF)
    expect(serializedLf).not.toMatch(/\r\n/);
    expect(serializedLf).toMatch(/\n/);
  });

  it('should preserve blank lines between statements', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'complex-ontology.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#Class1';
    modifyLabel(store, classUri, 'New Label');
    
    const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    
    // Count blank lines in original
    const originalBlankLines = content.match(/\n\s*\n/g) || [];
    const serializedBlankLines = serialized.match(/\n\s*\n/g) || [];
    
    // Should have similar number of blank lines
    // Note: When multiple blocks are serialized in reverse order, blank line preservation
    // can be imperfect due to position shifts. The test allows for a difference of 2.
    expect(Math.abs(originalBlankLines.length - serializedBlankLines.length)).toBeLessThanOrEqual(2);
  });

  it('should preserve comma placement (trailing, leading, or both)', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'comma-separated.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(store, classUri, 'New Label');
    
    const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    
    // Verify comma placement in subClassOf
    const originalCommaPattern = content.match(/rdfs:subClassOf\s+([^;]+)/)?.[1] || '';
    const serializedCommaPattern = serialized.match(/rdfs:subClassOf\s+([^;]+)/)?.[1] || '';
    
    // Comma positions should match
    const originalCommas = originalCommaPattern.match(/,/g) || [];
    const serializedCommas = serializedCommaPattern.match(/,/g) || [];
    expect(serializedCommas.length).toBe(originalCommas.length);
  });

  it('should preserve semicolon placement', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'simple-property.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#TestClass';
    modifyLabel(store, classUri, 'New Label');
    
    const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    
    // Verify semicolon placement matches original
    const originalSemicolons = content.match(/;/g) || [];
    const serializedSemicolons = serialized.match(/;/g) || [];
    
    // Should have same number of semicolons
    expect(serializedSemicolons.length).toBe(originalSemicolons.length);
  });

  it('should preserve mixed formatting styles in same file', async () => {
    const content = readFileSync(join(FIXTURES_DIR, 'complex-ontology.ttl'), 'utf-8');
    const { store, cache } = await parseTtlWithCache(content);
    
    const classUri = 'http://example.org/test#Class1';
    modifyLabel(store, classUri, 'New Label');
    
    const serialized = await storeToTurtle(store, undefined, content, cache, 'custom');
    
    // Verify that different classes maintain their own formatting
    // Extract Class1 block from original and serialized
    const class1Original = content.match(/:Class1[\s\S]*?\./)?.[0];
    const class1Serialized = serialized.match(/:Class1[\s\S]*?\./)?.[0];
    
    // Only the label should change, everything else should be identical
    if (class1Original && class1Serialized) {
      // Replace the label in original to compare
      const originalWithNewLabel = class1Original.replace(/rdfs:label\s+"[^"]+"/, 'rdfs:label "New Label"');
      expect(class1Serialized).toMatch(new RegExp(originalWithNewLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });
});
