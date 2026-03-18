import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseRdfToGraph } from '../../../src/parser';
import { storeToTurtle } from '../../../src/parser';
import { updateLabelInStore } from '../../../src/parser';
import { DataFactory } from 'n3';
import { RDFS } from '../../../src/parser';

const TEST_FIXTURES_DIR = join(__dirname, '../../fixtures');
const FIXTURES_DIR = join(__dirname, '../../fixtures/customSerializerFixtures');

describe('Custom Serializer Corruption Issues', () => {
  /**
   * Issue 1: Text duplication and corruption
   * When renaming a label, other properties are being duplicated and corrupted.
   * Example: ":exampleImage rdfs:label "example image"@en ;" becomes
   * ":exampleImage rdfs:label "example image"@en ; rdimage"@en ;"
   */
  it('should not corrupt other properties when renaming DrawingSheet label', async () => {
    const fixturePath = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');
    const originalContent = readFileSync(fixturePath, 'utf-8');
    
    // Parse original
    const parseResult = await parseRdfToGraph(originalContent, { path: fixturePath });
    const { store, originalFileCache } = parseResult;
    
    if (!originalFileCache) {
      throw new Error('Original file cache not available');
    }
    
    // Rename DrawingSheet label
    updateLabelInStore(store, 'DrawingSheet', 'Drawing Sheeta');
    
    // Serialize with custom serializer
    const serialized = await storeToTurtle(store, undefined, originalContent, originalFileCache, 'custom');
    
    // Verify no text corruption
    // Check that :exampleImage block is not corrupted
    const exampleImageMatch = serialized.match(/:exampleImage[\s\S]*?\.(?:\n|$|(?:\s+(?::|<|_:)))/) || 
                              serialized.match(/:exampleImage[\s\S]*?(?=\n\s*(?::|<|_:)|$)/);
    expect(exampleImageMatch).toBeTruthy();
    if (exampleImageMatch) {
      const exampleImageBlock = exampleImageMatch[0];
      // Should contain exactly one rdfs:label
      const labelMatches = exampleImageBlock.match(/rdfs:label/g);
      expect(labelMatches?.length).toBe(1);
      // Should not contain corrupted text like "rdimage"
      expect(exampleImageBlock).not.toMatch(/rdimage/);
      // Should contain the correct label
      expect(exampleImageBlock).toMatch(/rdfs:label\s+"example image"@en/);
    }
    
    // Check that :labellableRoot annotation property block is not corrupted
    // :labellableRoot is defined as an annotation property, so we need to match the definition block
    // Pattern: :labellableRoot followed by properties until a period and newline, then either end or a new subject
    const labellableRootMatch = serialized.match(/:labellableRoot\s+rdf:type\s+owl:AnnotationProperty[\s\S]*?\.(?:\n|$)/) || 
                                serialized.match(/:labellableRoot\s+rdf:type\s+owl:AnnotationProperty[\s\S]*?(?=\n\s*(?::|<|_:)|$)/);
    expect(labellableRootMatch).toBeTruthy();
    if (labellableRootMatch) {
      const labellableRootBlock = labellableRootMatch[0];
      // Should contain exactly one rdfs:label (the annotation property's label)
      const labelMatches = labellableRootBlock.match(/rdfs:label/g);
      expect(labelMatches?.length).toBe(1);
      // Should not contain corrupted text like "rdfllable root"
      expect(labellableRootBlock).not.toMatch(/rdfllable root/);
      // Should contain the correct label
      expect(labellableRootBlock).toMatch(/rdfs:label\s+"Labellable root"/);
    }
  });

  /**
   * Issue 2: Overlapping property line replacements
   * Properties are being replaced at incorrect positions, causing overlapping replacements.
   */
  it('should not have overlapping property line replacements', async () => {
    const fixturePath = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');
    const originalContent = readFileSync(fixturePath, 'utf-8');
    
    const parseResult = await parseRdfToGraph(originalContent, { path: fixturePath });
    const { store, originalFileCache } = parseResult;
    
    if (!originalFileCache) {
      throw new Error('Original file cache not available');
    }
    
    // Rename DrawingSheet label
    updateLabelInStore(store, 'DrawingSheet', 'Drawing Sheeta');
    
    const serialized = await storeToTurtle(store, undefined, originalContent, originalFileCache, 'custom');
    
    // Verify that each property appears exactly once per block
    // Check :contains property block
    const containsMatch = serialized.match(/:contains[\s\S]*?\.(?:\n|$|(?:\s+(?::|<|_:)))/) || 
                         serialized.match(/:contains[\s\S]*?(?=\n\s*(?::|<|_:)|$)/);
    expect(containsMatch).toBeTruthy();
    if (containsMatch) {
      const containsBlock = containsMatch[0];
      // Count occurrences of each property
      const rdfsLabelCount = (containsBlock.match(/rdfs:label/g) || []).length;
      const rdfsCommentCount = (containsBlock.match(/rdfs:comment/g) || []).length;
      const rdfsRangeCount = (containsBlock.match(/rdfs:range/g) || []).length;
      const rdfsDomainCount = (containsBlock.match(/rdfs:domain/g) || []).length;
      
      // Each should appear exactly once
      expect(rdfsLabelCount).toBe(1);
      expect(rdfsCommentCount).toBe(1);
      expect(rdfsRangeCount).toBe(1);
      expect(rdfsDomainCount).toBe(1);
    }
  });

  /**
   * Issue 3: Incorrect position calculations
   * Property line positions are calculated incorrectly, causing replacements at wrong positions.
   */
  it('should preserve exact text structure for unchanged properties', async () => {
    const fixturePath = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');
    const originalContent = readFileSync(fixturePath, 'utf-8');
    
    const parseResult = await parseRdfToGraph(originalContent, { path: fixturePath });
    const { store, originalFileCache } = parseResult;
    
    if (!originalFileCache) {
      throw new Error('Original file cache not available');
    }
    
    // Rename DrawingSheet label (should only affect DrawingSheet block)
    updateLabelInStore(store, 'DrawingSheet', 'Drawing Sheeta');
    
    const serialized = await storeToTurtle(store, undefined, originalContent, originalFileCache, 'custom');
    
    // Verify that blocks other than DrawingSheet are unchanged
    // :TextualNote should be unchanged
    const textualNoteOriginal = originalContent.match(/:TextualNote[\s\S]*?\.(?:\n|$|(?:\s+(?::|<|_:)))/)?.[0] || 
                                 originalContent.match(/:TextualNote[\s\S]*?(?=\n\s*(?::|<|_:)|$)/)?.[0];
    const textualNoteSerialized = serialized.match(/:TextualNote[\s\S]*?\.(?:\n|$|(?:\s+(?::|<|_:)))/)?.[0] || 
                                  serialized.match(/:TextualNote[\s\S]*?(?=\n\s*(?::|<|_:)|$)/)?.[0];
    expect(textualNoteSerialized).toBe(textualNoteOriginal);
    
    // :Note class block should be unchanged (match from line start to avoid matching "owl:onClass :Note" inside DrawingSheet)
    const noteBlockRegex = /(?:^|\n)(:Note\s+rdf:type\s+owl:Class[\s\S]*?\.)(?=\s*(?:\n|$|\r\n))/;
    const noteOriginal = originalContent.match(noteBlockRegex)?.[1] || originalContent.match(/(?:^|\n)(:Note\s+[\s\S]*?\.)(?=\s*(?:\n|$|\r\n))/)?.[1];
    const noteSerialized = serialized.match(noteBlockRegex)?.[1] || serialized.match(/(?:^|\n)(:Note\s+[\s\S]*?\.)(?=\s*(?:\n|$|\r\n))/)?.[1];
    expect(noteSerialized).toBe(noteOriginal);
    
    // :Metadata should be unchanged
    const metadataOriginal = originalContent.match(/:Metadata[\s\S]*?\.(?:\n|$|(?:\s+(?::|<|_:)))/)?.[0] || 
                             originalContent.match(/:Metadata[\s\S]*?(?=\n\s*(?::|<|_:)|$)/)?.[0];
    const metadataSerialized = serialized.match(/:Metadata[\s\S]*?\.(?:\n|$|(?:\s+(?::|<|_:)))/)?.[0] || 
                               serialized.match(/:Metadata[\s\S]*?(?=\n\s*(?::|<|_:)|$)/)?.[0];
    expect(metadataSerialized).toBe(metadataOriginal);
  });

  /**
   * Issue 4: Multiple matches for the same property on the same line
   * The regex might be matching the same property multiple times.
   */
  it('should not duplicate properties within the same block', async () => {
    const fixturePath = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');
    const originalContent = readFileSync(fixturePath, 'utf-8');
    
    const parseResult = await parseRdfToGraph(originalContent, { path: fixturePath });
    const { store, originalFileCache } = parseResult;
    
    if (!originalFileCache) {
      throw new Error('Original file cache not available');
    }
    
    // Rename DrawingSheet label
    updateLabelInStore(store, 'DrawingSheet', 'Drawing Sheeta');
    
    const serialized = await storeToTurtle(store, undefined, originalContent, originalFileCache, 'custom');
    
    // Split into blocks and verify each block has unique properties
    // Note: We need to be careful - inline restrictions contain their own properties
    // So we should only check properties of the main subject, not properties within inline blank nodes
    const blocks = serialized.split(/(?=^:[A-Za-z])/m);
    
    for (const block of blocks) {
      if (!block.trim()) continue;
      
      // Extract the main subject line and properties (before any inline restrictions)
      // Pattern: subject followed by properties until we hit an inline restriction [ or end of block
      const mainBlockMatch = block.match(/^:[^\n]+\n((?:[^\[]|\[[^\]]*\])*?)(?:\.|$)/s);
      if (!mainBlockMatch) continue;
      
      const mainBlock = mainBlockMatch[1] || block;
      
      // Count occurrences of each property type in the main block only
      const properties = ['rdf:type', 'rdfs:label', 'rdfs:comment', 'rdfs:subClassOf', 'rdfs:range', 'rdfs:domain', ':labellableRoot'];
      
      for (const prop of properties) {
        // Use word boundaries to avoid matching within other words
        // But be careful with :labellableRoot - it might appear in inline restrictions too
        const regex = new RegExp(`\\b${prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
        const matches = mainBlock.match(regex);
        if (matches) {
          // Each property should appear at most once per block (except rdfs:subClassOf which can appear multiple times)
          // Also, rdf:type can appear multiple times if there are inline restrictions (each has rdf:type owl:Restriction)
          // So we need to be more careful - only check properties that are direct properties of the main subject
          if (prop !== 'rdfs:subClassOf' && prop !== 'rdf:type') {
            expect(matches.length).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  /**
   * Issue 5: Property line boundaries are incorrect
   * The regex and position calculations are creating incorrect boundaries.
   */
  it('should correctly identify property line boundaries', async () => {
    const fixturePath = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');
    const originalContent = readFileSync(fixturePath, 'utf-8');
    
    const parseResult = await parseRdfToGraph(originalContent, { path: fixturePath });
    const { store, originalFileCache } = parseResult;
    
    if (!originalFileCache) {
      throw new Error('Original file cache not available');
    }
    
    // Rename DrawingSheet label
    updateLabelInStore(store, 'DrawingSheet', 'Drawing Sheeta');
    
    const serialized = await storeToTurtle(store, undefined, originalContent, originalFileCache, 'custom');
    
    // Debug: Check for "wl:" corruption
    // CRITICAL: We must check for standalone "wl:" (not part of "owl:")
    // The pattern "wl:" can appear inside "owl:", so we need to be more specific
    // Check for "wl:" that's at word boundary, start of line, or after whitespace/punctuation, but NOT after "o"
    const standaloneWlPattern = /(^|@prefix\s|\s|[^o])(wl:)/;
    if (standaloneWlPattern.test(serialized) && !serialized.match(/@prefix\s+wl:/)) {
      const lines = serialized.split('\n');
      const wlLineIndex = lines.findIndex(l => standaloneWlPattern.test(l));
      if (wlLineIndex >= 0) {
        console.error(`Found standalone "wl:" corruption on line ${wlLineIndex + 1}:`);
        console.error('Line:', lines[wlLineIndex]);
        console.error('Previous line:', lines[wlLineIndex - 1]);
        console.error('Next line:', lines[wlLineIndex + 1]);
        throw new Error(`Serialized output contains corrupted prefix "wl:" on line ${wlLineIndex + 1}. This suggests "owl:" was corrupted during text replacement.`);
      }
    }
    
    // Verify that the serialized output can be parsed back
    try {
      const reparseResult = await parseRdfToGraph(serialized, { path: fixturePath });
      expect(reparseResult.store).toBeDefined();
      
      // Verify DrawingSheet label was updated
      // First, find the DrawingSheet subject by searching for any quad with DrawingSheet in the URI
      const allQuads = reparseResult.store.getQuads(null, null, null, null);
      const drawingSheetQuad = allQuads.find(q => 
        q.subject.termType === 'NamedNode' && 
        (q.subject as { value: string }).value.includes('DrawingSheet')
      );
      
      expect(drawingSheetQuad).toBeTruthy();
      if (!drawingSheetQuad) {
        // Debug: list all subjects
        const allSubjects = new Set<string>();
        for (const q of allQuads) {
          if (q.subject.termType === 'NamedNode') {
            allSubjects.add((q.subject as { value: string }).value);
          }
        }
        throw new Error(`DrawingSheet subject not found. Available subjects: ${Array.from(allSubjects).slice(0, 10).join(', ')}`);
      }
      
      const drawingSheetSubject = drawingSheetQuad.subject;
      // Use the full URI for the label predicate
      const labelPredicateUri = 'http://www.w3.org/2000/01/rdf-schema#label';
      const labelQuads = reparseResult.store.getQuads(
        drawingSheetSubject,
        DataFactory.namedNode(labelPredicateUri),
        null,
        null
      );
      
      if (labelQuads.length === 0) {
        // Debug: check what quads exist for DrawingSheet
        const allDrawingSheetQuads = reparseResult.store.getQuads(drawingSheetSubject, null, null, null);
        const predicates = allDrawingSheetQuads.map(q => (q.predicate as { value: string }).value);
        // Also try with RDFS constant
        const labelQuadsWithRDFS = reparseResult.store.getQuads(
          drawingSheetSubject,
          DataFactory.namedNode(RDFS + 'label'),
          null,
          null
        );
        throw new Error(`No label quads found for DrawingSheet. Available predicates: ${predicates.join(', ')}. RDFS constant: ${RDFS}. RDFS label quads: ${labelQuadsWithRDFS.length}`);
      }
      
      expect(labelQuads.length).toBeGreaterThan(0);
      expect((labelQuads[0].object as { value: string }).value).toBe('Drawing Sheeta');
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Serialized output is not valid Turtle: ${error.message}`);
      }
      throw new Error(`Serialized output is not valid Turtle: ${error}`);
    }
  });

  /**
   * Issue 6: Only the changed property should be modified
   * When renaming DrawingSheet label, only that specific property line should change.
   */
  it('should only modify the changed property line in DrawingSheet block', async () => {
    const fixturePath = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');
    const originalContent = readFileSync(fixturePath, 'utf-8');
    
    const parseResult = await parseRdfToGraph(originalContent, { path: fixturePath });
    const { store, originalFileCache } = parseResult;
    
    if (!originalFileCache) {
      throw new Error('Original file cache not available');
    }
    
    // Rename DrawingSheet label
    updateLabelInStore(store, 'DrawingSheet', 'Drawing Sheeta');
    
    const serialized = await storeToTurtle(store, undefined, originalContent, originalFileCache, 'custom');
    
    // Extract DrawingSheet block
    const drawingSheetOriginal = originalContent.match(/:DrawingSheet[\s\S]*?\.(?:\n|$|(?:\s+(?::|<|_:)))/)?.[0] || 
                                 originalContent.match(/:DrawingSheet[\s\S]*?(?=\n\s*(?::|<|_:)|$)/)?.[0];
    const drawingSheetSerialized = serialized.match(/:DrawingSheet[\s\S]*?\.(?:\n|$|(?:\s+(?::|<|_:)))/)?.[0] || 
                                   serialized.match(/:DrawingSheet[\s\S]*?(?=\n\s*(?::|<|_:)|$)/)?.[0];
    
    expect(drawingSheetOriginal).toBeTruthy();
    expect(drawingSheetSerialized).toBeTruthy();
    
    if (drawingSheetOriginal && drawingSheetSerialized) {
      // Only the label should change
      expect(drawingSheetSerialized).toMatch(/rdfs:label\s+"Drawing Sheeta"/);
      expect(drawingSheetSerialized).not.toMatch(/rdfs:label\s+"Drawing Sheet"/);
      
      // Everything else should be the same (except for the label value)
      // Check that restrictions are preserved
      expect(drawingSheetSerialized).toMatch(/rdfs:subClassOf/);
      expect(drawingSheetSerialized).toMatch(/owl:Restriction/);
      expect(drawingSheetSerialized).toMatch(/owl:onProperty/);
      
      // Check that comment is preserved
      expect(drawingSheetSerialized).toMatch(/rdfs:comment\s+"Top-level container for a drawing\. Contains Layout\(s\)\."/);
      
      // Check that rdf:type (or a) and owl:Class are preserved (targeted replacement keeps rdf:type owl:Class)
      expect(drawingSheetSerialized).toMatch(/(?:\ba\s+owl:Class|rdf:type\s+owl:Class)/);
      
      // Check that labellableRoot is preserved (may be "false" or "false"^^xsd:boolean)
      expect(drawingSheetSerialized).toMatch(/:labellableRoot\s+(?:false|"false"\^\^xsd:boolean)/);
    }
  });
});
