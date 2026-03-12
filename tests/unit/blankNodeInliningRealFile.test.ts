/**
 * Unit test using the actual test-round-trip.ttl file to verify blank node inlining works correctly.
 * This test loads the real file, makes a change, saves it, and verifies:
 * 1. No blank nodes appear as _:df_X_Y at the top
 * 2. Restrictions are inlined with classes, not at the top
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseRdfToGraph, storeToTurtle, updateLabelInStore } from '../../src/parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_FIXTURES_DIR = join(__dirname, '../fixtures');

describe('Blank Node Inlining - Real File Test', () => {
  it('should not have blank nodes at top after save (test-round-trip.ttl)', async () => {
    const testFile = join(TEST_FIXTURES_DIR, 'test-round-trip.ttl');
    const originalContent = readFileSync(testFile, 'utf-8');
    
    // Parse the file
    const parseResult = await parseRdfToGraph(originalContent, { path: testFile });
    const { store, originalFileCache: cache } = parseResult;
    
    expect(cache).toBeDefined(); // Cache should be available for cache-based reconstruction
    
    // Make a simple change - rename a class
    const renamed = updateLabelInStore(store, 'TextualNote', 'TextualNoteRenamed');
    expect(renamed).toBe(true);
    
    // Save it using cache for cache-based reconstruction (preserves blank node inlining)
    // If cache is not available, post-processing will use store to build inline forms
    const output = await storeToTurtle(store, undefined, originalContent, cache ?? undefined);
    
    // Debug: Check for blank node references
    const blankNodeRefs = output.match(/_:df_\d+_\d+/g);
    if (blankNodeRefs) {
      console.log('Found blank node references:', blankNodeRefs.slice(0, 10));
    }
    
    // Debug: Check DrawingSheet class specifically
    const drawingSheetMatch = output.match(/:DrawingSheet[\s\S]*?rdfs:subClassOf[^.]*\./);
    if (drawingSheetMatch) {
      console.log('DrawingSheet subClassOf:', drawingSheetMatch[0].substring(0, 200));
    }
    
    // Check: NO blank nodes should appear as _:df_X_Y or _:n3-X at the top
    const lines = output.split('\n');
    
    // Find where prefixes end and content begins
    let contentStartIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('#')) {
        // Skip comment lines after prefixes
        continue;
      }
      if (!lines[i].trim().startsWith('@prefix') && 
          !lines[i].trim().startsWith('@base') && 
          lines[i].trim().length > 0) {
        contentStartIndex = i;
        break;
      }
    }
    
    // Check the first 50 lines after prefixes for blank node blocks
    const checkLines = lines.slice(contentStartIndex, contentStartIndex + 50);
    for (let i = 0; i < checkLines.length; i++) {
      const line = checkLines[i].trim();
      // Should NOT find blank node blocks like _:df_0_0 or _:n3-0
      if (line.match(/^_:(df_\d+_\d+|n3-\d+)/)) {
        throw new Error(`Found blank node block at line ${contentStartIndex + i + 1}: ${line.substring(0, 100)}`);
      }
    }
    
    // Also check the entire output for blank node blocks at the top (before Classes section)
    const classesSectionIndex = output.indexOf('#    Classes');
    if (classesSectionIndex > 0) {
      const beforeClasses = output.substring(0, classesSectionIndex);
      // Should not contain blank node blocks
      if (beforeClasses.match(/^[^\n]*_:(df_\d+_\d+|n3-\d+)\s+/m)) {
        throw new Error('Found blank node blocks before Classes section');
      }
    }
    
    // Verify blank nodes are inlined (should find [ rdf:type owl:Restriction in the output)
    expect(output).toMatch(/\[[\s\S]*?rdf:type[\s\S]*?owl:Restriction/);
    
    // Verify no _:df_X_Y format anywhere
    expect(output).not.toMatch(/_:df_\d+_\d+/);
    expect(output).not.toMatch(/_:n3-\d+/);
  });
});
