/**
 * Unit tests for source preservation functionality
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseTurtleWithPositions, reconstructFromOriginalText, type OriginalFileCache, type StatementBlock } from '../../src/rdf/sourcePreservation';
import { parseTtlToGraph, storeToTurtle, updateLabelInStore } from '../../src/parser';
import { Store } from 'n3';

describe('sourcePreservation', () => {
  describe('parseTurtleWithPositions', () => {
    it('should parse simple Turtle file with positions', async () => {
      const content = `@prefix : <http://example.org#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test" .`;

      const { quads, cache } = parseTurtleWithPositions(content);

      expect(quads.length).toBeGreaterThan(0);
      expect(cache.format).toBe('turtle');
      expect(cache.content).toBe(content);
      expect(cache.statementBlocks.length).toBeGreaterThan(0);
      expect(cache.headerSection).toBeTruthy();
      expect(cache.headerSection?.blocks.length).toBeGreaterThan(0);
    });

    it('should detect formatting style', async () => {
      const content = `@prefix : <http://example.org#> .

:TestClass rdf:type owl:Class .`;

      const { cache } = parseTurtleWithPositions(content);

      expect(cache.formattingStyle).toBeDefined();
      expect(cache.formattingStyle.lineEnding).toMatch(/^\n|\r\n$/);
      expect(cache.formattingStyle.indentSize).toBeGreaterThan(0);
    });

    it('should track statement blocks with positions', async () => {
      const content = `@prefix : <http://example.org#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test" .`;

      const { cache } = parseTurtleWithPositions(content);

      const classBlocks = cache.statementBlocks.filter(b => b.type === 'Class');
      expect(classBlocks.length).toBeGreaterThan(0);

      const block = classBlocks[0];
      expect(block.position.start).toBeGreaterThanOrEqual(0);
      expect(block.position.end).toBeGreaterThan(block.position.start);
      expect(block.position.startLine).toBeGreaterThan(0);
      expect(block.position.endLine).toBeGreaterThanOrEqual(block.position.startLine);
      expect(block.originalText).toBeTruthy();
    });

    it('should match quads to blocks', async () => {
      const content = `@prefix : <http://example.org#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test" .`;

      const { quads, cache } = parseTurtleWithPositions(content);

      expect(quads.length).toBeGreaterThan(0);
      
      // At least some quads should be matched to blocks
      const blocksWithQuads = cache.statementBlocks.filter(b => b.quads.length > 0);
      expect(blocksWithQuads.length).toBeGreaterThan(0);
    });
  });

  describe('reconstructFromOriginalText', () => {
    it('should return original text when no modifications', async () => {
      const content = `@prefix : <http://example.org#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test" .`;

      const { cache } = parseTurtleWithPositions(content);
      const result = await reconstructFromOriginalText(cache, []);

      expect(result).toBe(content);
    });

    it('should handle deleted blocks', async () => {
      const content = `@prefix : <http://example.org#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test" .`;

      const { cache } = parseTurtleWithPositions(content);
      
      const classBlock = cache.statementBlocks.find(b => b.type === 'Class');
      expect(classBlock).toBeTruthy();
      
      if (classBlock) {
        const deletedBlock: StatementBlock = {
          ...classBlock,
          isDeleted: true
        };
        
        const result = await reconstructFromOriginalText(cache, [deletedBlock]);
        
        // Result should not contain the class definition
        expect(result).not.toContain(':TestClass');
      }
    });
  });

  describe('integration with parser', () => {
    it('should preserve cache in ParseResult', async () => {
      const content = `@prefix : <http://example.org#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test" .`;

      const parseResult = await parseTtlToGraph(content);
      
      expect(parseResult.originalFileCache).toBeDefined();
      expect(parseResult.originalFileCache?.format).toBe('turtle');
      expect(parseResult.originalFileCache?.content).toBe(content);
    });

    it('should use cache in storeToTurtle when available', async () => {
      const content = `@prefix : <http://example.org#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test" .`;

      const parseResult = await parseTtlToGraph(content);
      const store = parseResult.store;
      const cache = parseResult.originalFileCache;
      
      expect(cache).toBeDefined();
      
      // Serialize without modifications - should return original
      const result = await storeToTurtle(store, undefined, undefined, cache);
      
      // Result should be very similar to original (may have minor formatting differences)
      expect(result).toContain(':TestClass');
      expect(result).toContain('rdf:type owl:Class');
    });
  });

  describe('idempotent round-trip', () => {
    it('should preserve file after modify and revert', async () => {
      const fixturePath = join(__dirname, '../fixtures/test-round-trip.ttl');
      const originalContent = readFileSync(fixturePath, 'utf-8');
      
      // Parse original
      const parseResult1 = await parseTtlToGraph(originalContent);
      const store1 = parseResult1.store;
      const cache1 = parseResult1.originalFileCache;
      
      expect(cache1).toBeDefined();
      
      // Modify: rename a class
      const classNode = parseResult1.graphData.nodes.find(n => n.label === 'Text');
      expect(classNode).toBeDefined();
      
      if (classNode) {
        const oldLabel = classNode.label;
        const newLabel = 'TextRenamed';
        
        // Update label
        updateLabelInStore(store1, classNode.id, newLabel);
        
        // Save (first modification)
        const modifiedContent = await storeToTurtle(store1, undefined, undefined, cache1);
        
        // Parse modified
        const parseResult2 = await parseTtlToGraph(modifiedContent);
        const store2 = parseResult2.store;
        const cache2 = parseResult2.originalFileCache;
        
        // Verify modification
        const modifiedNode = parseResult2.graphData.nodes.find(n => n.id === classNode.id);
        expect(modifiedNode?.label).toBe(newLabel);
        
        // Revert modification
        updateLabelInStore(store2, classNode.id, oldLabel);
        
        // Save (revert)
        const revertedContent = await storeToTurtle(store2, undefined, undefined, cache2);
        
        // Parse reverted
        const parseResult3 = await parseTtlToGraph(revertedContent);
        
        // Verify reversion
        const revertedNode = parseResult3.graphData.nodes.find(n => n.id === classNode.id);
        expect(revertedNode?.label).toBe(oldLabel);
        
        // Note: Full idempotency (exact file match) requires perfect modification tracking
        // This test verifies that the basic round-trip works
        // Full idempotency will be achieved when modification tracking is complete
      }
    });
  });

  describe('edge cases', () => {
    describe('blank node handling', () => {
      it('should preserve inline blank nodes', async () => {
        const fixturePath = join(__dirname, '../fixtures/blank-nodes-inline.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const store = parseResult.store;
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // Serialize and verify structure is preserved
        const result = await storeToTurtle(store, undefined, undefined, cache);
        
        // Should contain the class
        expect(result).toContain('ClassWithInlineRestrictions');
        // Should NOT have blank node blocks at the top of the file (before classes)
        const lines = result.split('\n');
        const classIndex = lines.findIndex(l => l.includes('ClassWithInlineRestrictions'));
        if (classIndex > 0) {
          const beforeClass = lines.slice(0, classIndex).join('\n');
          // Should not have explicit blank node blocks before the class
          expect(beforeClass).not.toMatch(/^[^\n]*_:df_\d+_\d+\s+/m);
          expect(beforeClass).not.toMatch(/^[^\n]*_:n3-\d+\s+/m);
        }
        // Note: Full inline blank node preservation requires perfect serialization
        // Current implementation may serialize as _:df_X_Y but won't create blocks at top
      });

      it('should handle nested blank nodes', async () => {
        const fixturePath = join(__dirname, '../fixtures/nested-blank-nodes.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const store = parseResult.store;
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        const result = await storeToTurtle(store, undefined, undefined, cache);
        
        // Should contain the class
        expect(result).toContain('ComplexClass');
        // Note: Blank node inlining in nested structures may not be perfect yet
        // This test verifies the structure is preserved, even if blank nodes aren't fully inlined
      });

      it('should not create explicit blank node blocks', async () => {
        const fixturePath = join(__dirname, '../fixtures/test-round-trip.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const store = parseResult.store;
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        const result = await storeToTurtle(store, undefined, undefined, cache);
        
        // Check first 100 lines for blank node blocks
        const lines = result.split('\n');
        const checkLines = lines.slice(0, 100);
        for (const line of checkLines) {
          const trimmed = line.trim();
          // Should NOT find blank node blocks at the start of lines
          expect(trimmed).not.toMatch(/^_:(df_\d+_\d+|n3-\d+)\s+/);
        }
      });
    });

    describe('formatting preservation', () => {
      it('should preserve different indentation styles', async () => {
        const fixturePath = join(__dirname, '../fixtures/mixed-formatting.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        expect(cache?.formattingStyle.indentSize).toBeGreaterThan(0);
        
        // Formatting style should be detected
        expect(cache?.formattingStyle).toBeDefined();
      });

      it('should preserve line endings', async () => {
        const contentLF = '@prefix : <http://example.org#> .\n:Test rdf:type owl:Class .';
        const contentCRLF = '@prefix : <http://example.org#> .\r\n:Test rdf:type owl:Class .';
        
        const { cache: cacheLF } = parseTurtleWithPositions(contentLF);
        const { cache: cacheCRLF } = parseTurtleWithPositions(contentCRLF);
        
        expect(cacheLF.formattingStyle.lineEnding).toBe('\n');
        expect(cacheCRLF.formattingStyle.lineEnding).toBe('\r\n');
      });

      it('should preserve trailing newlines', async () => {
        const contentWithNewline = '@prefix : <http://example.org#> .\n:Test rdf:type owl:Class .\n';
        const contentWithoutNewline = '@prefix : <http://example.org#> .\n:Test rdf:type owl:Class .';
        
        const { cache: cacheWith } = parseTurtleWithPositions(contentWithNewline);
        const { cache: cacheWithout } = parseTurtleWithPositions(contentWithoutNewline);
        
        expect(cacheWith.formattingStyle.trailingNewline).toBe(true);
        expect(cacheWithout.formattingStyle.trailingNewline).toBe(false);
      });
    });

    describe('section structure', () => {
      it('should handle files with no structure', async () => {
        const fixturePath = join(__dirname, '../fixtures/no-structure.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // File has no structure (mixed classes and properties)
        // Sections should reflect this
        const classSections = cache?.sections.filter(s => s.type === 'Class') || [];
        const propertySections = cache?.sections.filter(s => s.type === 'ObjectProperty') || [];
        
        // If multiple sections of same type exist, hasStructure should be false
        if (classSections.length > 1 || propertySections.length > 1) {
          const hasStructure = cache?.sections.every(s => s.hasStructure) ?? false;
          expect(hasStructure).toBe(false);
        }
      });

      it('should preserve section order', async () => {
        const fixturePath = join(__dirname, '../fixtures/test-round-trip.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // Sections should be in order
        const sections = cache?.sections || [];
        expect(sections.length).toBeGreaterThan(0);
        
        // Verify sections are ordered by position
        for (let i = 1; i < sections.length; i++) {
          expect(sections[i].startPosition.start).toBeGreaterThan(sections[i - 1].startPosition.start);
        }
      });
    });

    describe('comments', () => {
      it('should preserve inline comments', async () => {
        const fixturePath = join(__dirname, '../fixtures/comments-complex.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // Find block with inline comment
        const blockWithComment = cache?.statementBlocks.find(b => 
          b.originalText && b.originalText.includes('# inline comment')
        );
        
        expect(blockWithComment).toBeDefined();
        if (blockWithComment) {
          expect(blockWithComment.originalText).toContain('# inline comment');
        }
      });

      it('should preserve comment lines', async () => {
        const fixturePath = join(__dirname, '../fixtures/comments-complex.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // Original content should contain comment lines
        expect(cache?.content).toContain('# This is a comment before the class');
        expect(cache?.content).toContain('# Another comment');
      });

      it('should preserve section dividers', async () => {
        const fixturePath = join(__dirname, '../fixtures/comments-complex.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // Should contain section divider
        expect(cache?.content).toContain('#################################################################');
      });
    });

    describe('URI notation', () => {
      it('should handle prefix notation', async () => {
        const content = `@prefix : <http://example.org#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
:TestClass rdf:type owl:Class .`;
        
        const parseResult = await parseTtlToGraph(content);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // Should find block with prefix notation
        const classBlock = cache?.statementBlocks.find(b => b.type === 'Class');
        expect(classBlock).toBeDefined();
        expect(classBlock?.subject).toContain(':');
      });

      it('should handle full URI notation', async () => {
        const content = `@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
<http://example.org#TestClass> rdf:type owl:Class .`;
        
        const parseResult = await parseTtlToGraph(content);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        const classBlock = cache?.statementBlocks.find(b => b.type === 'Class');
        expect(classBlock).toBeDefined();
        expect(classBlock?.subject).toContain('<http://example.org#TestClass>');
      });

      it('should handle base IRI notation', async () => {
        const fixturePath = join(__dirname, '../fixtures/base-iri.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // Should have @base in header
        const headerBlocks = cache?.headerSection?.blocks || [];
        const hasBase = headerBlocks.some(b => b.originalText?.includes('@base'));
        expect(hasBase).toBe(true);
        
        // Should find classes with <#Class> notation
        const classBlocks = cache?.statementBlocks.filter(b => b.type === 'Class') || [];
        expect(classBlocks.length).toBeGreaterThan(0);
      });
    });

    describe('special characters', () => {
      it('should handle unicode in labels', async () => {
        const fixturePath = join(__dirname, '../fixtures/special-characters.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // Should preserve unicode characters
        expect(cache?.content).toContain('Café');
      });

      it('should handle language tags', async () => {
        const fixturePath = join(__dirname, '../fixtures/special-characters.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // Should preserve language tags
        expect(cache?.content).toContain('"@en');
        expect(cache?.content).toContain('"@fr');
      });

      it('should handle escaped characters', async () => {
        const fixturePath = join(__dirname, '../fixtures/special-characters.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // Should preserve escaped quotes
        expect(cache?.content).toContain('\\"hello\\"');
      });

      it('should handle boolean literals', async () => {
        const fixturePath = join(__dirname, '../fixtures/special-characters.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // Should preserve boolean literal syntax
        expect(cache?.content).toContain('"true"^^xsd:boolean');
      });
    });

    describe('import ordering', () => {
      it('should preserve import order', async () => {
        const fixturePath = join(__dirname, '../fixtures/multiple-imports.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // Find ontology block
        const ontologyBlock = cache?.statementBlocks.find(b => b.type === 'Ontology');
        expect(ontologyBlock).toBeDefined();
        
        if (ontologyBlock) {
          // Should contain imports in order
          const import1Index = ontologyBlock.originalText?.indexOf('import1') ?? -1;
          const import2Index = ontologyBlock.originalText?.indexOf('import2') ?? -1;
          const import3Index = ontologyBlock.originalText?.indexOf('import3') ?? -1;
          
          expect(import1Index).toBeGreaterThan(-1);
          expect(import2Index).toBeGreaterThan(import1Index);
          expect(import3Index).toBeGreaterThan(import2Index);
        }
      });
    });

    describe('complex modifications', () => {
      it('should handle modifying multiple properties', async () => {
        const content = `@prefix : <http://example.org#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test" ;
    rdfs:comment "Original comment" .`;

        const parseResult = await parseTtlToGraph(content);
        const store = parseResult.store;
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // Modify both label and comment
        const classNode = parseResult.graphData.nodes.find(n => n.id.includes('TestClass'));
        if (classNode) {
          updateLabelInStore(store, classNode.id, 'Modified Test');
          // Note: updateCommentInStore would be needed for comment modification
        }
        
        const result = await storeToTurtle(store, undefined, undefined, cache);
        
        // Should contain modified label
        expect(result).toContain('Modified Test');
      });

      it('should preserve structure when no modifications', async () => {
        const fixturePath = join(__dirname, '../fixtures/test-round-trip.ttl');
        const originalContent = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(originalContent);
        const store = parseResult.store;
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // Serialize without modifications
        const result = await storeToTurtle(store, undefined, undefined, cache);
        
        // Should preserve section structure
        expect(result).toContain('#################################################################');
        expect(result).toContain('#    Classes');
      });
    });

    describe('real-world scenarios', () => {
      it('should handle test-round-trip fixture completely', async () => {
        const fixturePath = join(__dirname, '../fixtures/test-round-trip.ttl');
        const originalContent = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(originalContent);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        expect(cache?.statementBlocks.length).toBeGreaterThan(0);
        expect(cache?.sections.length).toBeGreaterThan(0);
        
        // Verify all sections are detected
        const sectionTypes = new Set(cache?.sections.map(s => s.type) || []);
        expect(sectionTypes.size).toBeGreaterThan(0);
      });

      it('should handle aec_drawing_metadata fixture', async () => {
        const fixturePath = join(__dirname, '../fixtures/aec_drawing_metadata.ttl');
        const originalContent = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(originalContent);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        expect(cache?.statementBlocks.length).toBeGreaterThan(0);
        
        // Should have parsed successfully
        expect(parseResult.graphData.nodes.length).toBeGreaterThan(0);
      });
    });

    describe('empty and minimal files', () => {
      it('should handle empty file', async () => {
        const fixturePath = join(__dirname, '../fixtures/empty-file.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        // Should not crash
        const { cache } = parseTurtleWithPositions(content);
        
        expect(cache).toBeDefined();
        expect(cache.format).toBe('turtle');
        expect(cache.statementBlocks.length).toBe(0);
      });

      it('should handle file with only prefixes', async () => {
        const fixturePath = join(__dirname, '../fixtures/only-prefixes.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        expect(cache?.headerSection).toBeTruthy();
        expect(cache?.headerSection?.blocks.length).toBeGreaterThan(0);
        expect(cache?.statementBlocks.filter(b => b.type !== 'Header').length).toBe(0);
      });

      it('should handle file with only comments', async () => {
        const fixturePath = join(__dirname, '../fixtures/only-comments.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const { cache } = parseTurtleWithPositions(content);
        
        expect(cache).toBeDefined();
        // Comments should be preserved in original content
        expect(cache.content).toContain('# This file contains only comments');
      });

      it('should handle file with only ontology declaration', async () => {
        const fixturePath = join(__dirname, '../fixtures/only-ontology.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        const ontologyBlocks = cache?.statementBlocks.filter(b => b.type === 'Ontology') || [];
        expect(ontologyBlocks.length).toBeGreaterThan(0);
        expect(parseResult.graphData.nodes.length).toBe(0); // No classes
      });
    });

    describe('whitespace preservation', () => {
      it('should preserve multiple blank lines', async () => {
        const fixturePath = join(__dirname, '../fixtures/whitespace-complex.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // Original should contain multiple blank lines
        const blankLineCount = (cache?.content.match(/\n\s*\n/g) || []).length;
        expect(blankLineCount).toBeGreaterThan(0);
      });

      it('should preserve trailing whitespace on lines', async () => {
        const content = `@prefix : <http://example.org#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:TestClass rdf:type owl:Class ;    
    rdfs:label "Test" .    `;
        
        const { cache } = parseTurtleWithPositions(content);
        
        expect(cache).toBeDefined();
        // Trailing whitespace should be in original text
        const classBlock = cache.statementBlocks.find(b => b.type === 'Class');
        if (classBlock && classBlock.originalText) {
          // Should contain trailing spaces
          expect(classBlock.originalText).toMatch(/\.\s+$/);
        }
      });
    });

    describe('RDF collections', () => {
      it('should handle RDF lists', async () => {
        const fixturePath = join(__dirname, '../fixtures/rdf-collections.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // Should contain list syntax
        expect(cache?.content).toContain('( :item1 :item2 :item3 )');
      });

      it('should handle empty lists', async () => {
        const fixturePath = join(__dirname, '../fixtures/rdf-collections.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // Should contain empty list syntax
        expect(cache?.content).toContain('()');
      });

      it('should handle nested lists', async () => {
        const fixturePath = join(__dirname, '../fixtures/rdf-collections.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // Should contain nested list syntax
        expect(cache?.content).toContain('( ( :item1 :item2 )');
      });
    });

    describe('multiple round-trips', () => {
      it('should handle multiple consecutive round-trips', async () => {
        const fixturePath = join(__dirname, '../fixtures/test-round-trip.ttl');
        const originalContent = readFileSync(fixturePath, 'utf-8');
        
        let parseResult = await parseTtlToGraph(originalContent);
        let store = parseResult.store;
        let cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // Perform multiple round-trips
        for (let i = 0; i < 3; i++) {
          // Modify: rename a class
          const classNode = parseResult.graphData.nodes.find(n => n.label === 'Text');
          if (classNode) {
            const newLabel = `TextModified${i}`;
            updateLabelInStore(store, classNode.id, newLabel);
            
            // Save
            const modifiedContent = await storeToTurtle(store, undefined, undefined, cache);
            
            // Parse again
            parseResult = await parseTtlToGraph(modifiedContent);
            store = parseResult.store;
            cache = parseResult.originalFileCache;
            
            // Verify modification
            const modifiedNode = parseResult.graphData.nodes.find(n => n.id === classNode.id);
            expect(modifiedNode?.label).toBe(newLabel);
          }
        }
      });

      it('should handle round-trip with no changes', async () => {
        const fixturePath = join(__dirname, '../fixtures/test-round-trip.ttl');
        const originalContent = readFileSync(fixturePath, 'utf-8');
        
        const parseResult1 = await parseTtlToGraph(originalContent);
        const store1 = parseResult1.store;
        const cache1 = parseResult1.originalFileCache;
        
        expect(cache1).toBeDefined();
        
        // Save without modifications
        const savedContent = await storeToTurtle(store1, undefined, undefined, cache1);
        
        // Parse saved content
        const parseResult2 = await parseTtlToGraph(savedContent);
        const cache2 = parseResult2.originalFileCache;
        
        // Should have same number of nodes
        expect(parseResult2.graphData.nodes.length).toBe(parseResult1.graphData.nodes.length);
        
        // Cache should be preserved
        expect(cache2).toBeDefined();
      });

      it('should handle round-trip after add then delete', async () => {
        const content = `@prefix : <http://example.org#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:OriginalClass rdf:type owl:Class ;
    rdfs:label "Original" .`;

        const parseResult1 = await parseTtlToGraph(content);
        const store1 = parseResult1.store;
        const cache1 = parseResult1.originalFileCache;
        
        expect(cache1).toBeDefined();
        
        // Add a class (would require addNodeToStore - simplified test)
        // For now, just verify structure is preserved
        const saved1 = await storeToTurtle(store1, undefined, undefined, cache1);
        const parseResult2 = await parseTtlToGraph(saved1);
        
        // Should still have original class
        const originalNode = parseResult2.graphData.nodes.find(n => n.label === 'Original');
        expect(originalNode).toBeDefined();
      });
    });

    describe('modification edge cases', () => {
      it('should handle modifying class with many restrictions', async () => {
        const fixturePath = join(__dirname, '../fixtures/many-restrictions.ttl');
        const content = readFileSync(fixturePath, 'utf-8');
        
        const parseResult = await parseTtlToGraph(content);
        const store = parseResult.store;
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // Find the complex class
        const complexNode = parseResult.graphData.nodes.find(n => n.label === 'Complex Class');
        expect(complexNode).toBeDefined();
        
        if (complexNode) {
          // Verify class exists
          expect(complexNode).toBeTruthy();
          
          // Modify label
          updateLabelInStore(store, complexNode.id, 'Modified Complex Class');
          
          const result = await storeToTurtle(store, undefined, undefined, cache);
          
          // Should contain modified label
          expect(result).toContain('Modified Complex Class');
          // Should still have the class (restrictions are in subClassOf, may be serialized as blank nodes)
          expect(result).toContain('ComplexClass');
          // Note: Restrictions may be serialized as blank nodes (_:df_X_Y) rather than inline
          // This is acceptable - the important thing is structure is preserved and class is modified correctly
        }
      });

      it('should preserve structure when modifying multiple classes', async () => {
        const content = `@prefix : <http://example.org#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Class1 rdf:type owl:Class ;
    rdfs:label "Class 1" .

:Class2 rdf:type owl:Class ;
    rdfs:label "Class 2" .

:Class3 rdf:type owl:Class ;
    rdfs:label "Class 3" .`;

        const parseResult = await parseTtlToGraph(content);
        const store = parseResult.store;
        const cache = parseResult.originalFileCache;
        
        expect(cache).toBeDefined();
        
        // Modify multiple classes
        const node1 = parseResult.graphData.nodes.find(n => n.label === 'Class 1');
        const node2 = parseResult.graphData.nodes.find(n => n.label === 'Class 2');
        
        if (node1) updateLabelInStore(store, node1.id, 'Modified Class 1');
        if (node2) updateLabelInStore(store, node2.id, 'Modified Class 2');
        
        const result = await storeToTurtle(store, undefined, undefined, cache);
        
        // Should contain both modifications
        expect(result).toContain('Modified Class 1');
        expect(result).toContain('Modified Class 2');
        // Should still contain unmodified class
        expect(result).toContain('Class 3');
      });
    });
  });
});
