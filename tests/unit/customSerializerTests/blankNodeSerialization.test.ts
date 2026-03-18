/**
 * Unit tests to isolate blank node serialization issues.
 * These tests focus on understanding why blank nodes are serialized as empty [  ].
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseRdfToGraph, updateLabelInStore, storeToTurtle } from '../../../src/parser';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { DataFactory, Store } from 'n3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_FIXTURES_DIR = join(__dirname, '../../fixtures');
const FIXTURE_PATH = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');

describe('Blank Node Serialization Isolation', () => {
  it('should verify that DrawingSheet block has blank node quads in store after parsing', async () => {
    const originalContent = readFileSync(FIXTURE_PATH, 'utf-8');
    const parseResult = await parseRdfToGraph(originalContent, { path: FIXTURE_PATH });
    const { store } = parseResult;
    
    // Find DrawingSheet class URI (fixture uses @prefix : <http://example.org/aec-drawing-ontology#>)
    const drawingSheetUri = 'http://example.org/aec-drawing-ontology#DrawingSheet';
    const drawingSheetNode = DataFactory.namedNode(drawingSheetUri);
    
    // Get all rdfs:subClassOf quads for DrawingSheet
    const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
    const subClassOfQuads = store.getQuads(drawingSheetNode, DataFactory.namedNode(RDFS + 'subClassOf'), null, null);
    
    expect(subClassOfQuads.length).toBeGreaterThan(0);
    
    // Check that we have blank nodes as objects
    const blankNodeObjects = subClassOfQuads.filter(q => q.object.termType === 'BlankNode');
    expect(blankNodeObjects.length).toBe(5); // Fixture has 5 restrictions (Note, RevisionTable, Layout, FacadeComponent, DrawingOrientation)
    
    // For each blank node, verify it has quads in the store
    for (const quad of blankNodeObjects) {
      const blankNode = quad.object;
      const blankQuads = store.getQuads(blankNode, null, null, null);
      expect(blankQuads.length).toBeGreaterThan(0);
      
      // Verify it has required properties
      const hasOnProperty = blankQuads.some(q => (q.predicate as { value: string }).value.includes('onProperty'));
      const hasOnClass = blankQuads.some(q => (q.predicate as { value: string }).value.includes('onClass'));
      expect(hasOnProperty || hasOnClass).toBe(true);
    }
  });

  it('should verify that DrawingSheet block has blank node quads after label rename', async () => {
    const originalContent = readFileSync(FIXTURE_PATH, 'utf-8');
    const parseResult = await parseRdfToGraph(originalContent, { path: FIXTURE_PATH });
    const { store } = parseResult;
    
    // Rename label
    updateLabelInStore(store, 'DrawingSheet', 'Drawing sheet renamed');
    
    // Find DrawingSheet class URI (fixture uses @prefix : <http://example.org/aec-drawing-ontology#>)
    const drawingSheetUri = 'http://example.org/aec-drawing-ontology#DrawingSheet';
    const drawingSheetNode = DataFactory.namedNode(drawingSheetUri);
    
    // Get all rdfs:subClassOf quads for DrawingSheet
    const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
    const subClassOfQuads = store.getQuads(drawingSheetNode, DataFactory.namedNode(RDFS + 'subClassOf'), null, null);
    
    expect(subClassOfQuads.length).toBe(5); // Should still have 5 restrictions
    
    // Check that we have blank nodes as objects
    const blankNodeObjects = subClassOfQuads.filter(q => q.object.termType === 'BlankNode');
    expect(blankNodeObjects.length).toBe(5);
    
    // For each blank node, verify it has quads in the store
    for (const quad of blankNodeObjects) {
      const blankNode = quad.object;
      const blankQuads = store.getQuads(blankNode, null, null, null);
      expect(blankQuads.length).toBeGreaterThan(0);
      
      // Verify it has required properties
      const hasOnProperty = blankQuads.some(q => (q.predicate as { value: string }).value.includes('onProperty'));
      const hasOnClass = blankQuads.some(q => (q.predicate as { value: string }).value.includes('onClass'));
      expect(hasOnProperty || hasOnClass).toBe(true);
    }
  });

  it('should verify that originalFileCache has blank node quads for DrawingSheet block', async () => {
    const originalContent = readFileSync(FIXTURE_PATH, 'utf-8');
    const parseResult = await parseRdfToGraph(originalContent, { path: FIXTURE_PATH });
    const { originalFileCache } = parseResult;
    
    if (!originalFileCache) {
      throw new Error('Original file cache not available');
    }
    
    // Find DrawingSheet block
    const drawingSheetBlock = originalFileCache.statementBlocks.find(
      block => block.subject === ':DrawingSheet' || block.subject?.includes('DrawingSheet')
    );
    
    expect(drawingSheetBlock).toBeTruthy();
    if (!drawingSheetBlock) return;
    
    // Check that block has quads
    expect(drawingSheetBlock.quads.length).toBeGreaterThan(0);
    
    // Check that block has blank node quads (where blank node is subject)
    const blankNodeQuads = drawingSheetBlock.quads.filter(q => q.subject.termType === 'BlankNode');
    expect(blankNodeQuads.length).toBeGreaterThan(0);
    
    // Check that we have rdfs:subClassOf quads with blank node objects
    const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
    const subClassOfQuads = drawingSheetBlock.quads.filter(q => 
      q.predicate.termType === 'NamedNode' && 
      (q.predicate as { value: string }).value === RDFS + 'subClassOf' &&
      q.object.termType === 'BlankNode'
    );
    expect(subClassOfQuads.length).toBe(5);
  });

  it('should verify block.quads includes blank node quads after label rename in reconstructFromCache', async () => {
    const originalContent = readFileSync(FIXTURE_PATH, 'utf-8');
    const parseResult = await parseRdfToGraph(originalContent, { path: FIXTURE_PATH });
    let { store, originalFileCache } = parseResult;
    
    if (!originalFileCache) {
      throw new Error('Original file cache not available');
    }
    
    // Rename label
    updateLabelInStore(store, 'DrawingSheet', 'Drawing sheet renamed');
    
    // Manually check what happens in reconstructFromCache
    // Find DrawingSheet block
    const drawingSheetBlock = originalFileCache.statementBlocks.find(
      block => block.subject === ':DrawingSheet' || block.subject?.includes('DrawingSheet')
    );
    
    expect(drawingSheetBlock).toBeTruthy();
    if (!drawingSheetBlock) return;
    
    // Simulate what reconstructFromCache does - get current quads for the subject
    const drawingSheetUri = 'http://example.org/aec-drawing-ontology#DrawingSheet';
    const currentQuads = store.getQuads(DataFactory.namedNode(drawingSheetUri), null, null, null);
    
    expect(currentQuads.length).toBeGreaterThan(0);
    
    // Check for rdfs:subClassOf quads with blank nodes
    const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
    const subClassOfQuads = currentQuads.filter(q => 
      q.predicate.termType === 'NamedNode' && 
      (q.predicate as { value: string }).value === RDFS + 'subClassOf' &&
      q.object.termType === 'BlankNode'
    );
    expect(subClassOfQuads.length).toBe(5);
    
    // For each blank node, get its quads
    const allBlankNodeQuads: typeof currentQuads = [];
    for (const quad of subClassOfQuads) {
      const blankNode = quad.object;
      const blankQuads = store.getQuads(blankNode, null, null, null);
      allBlankNodeQuads.push(...blankQuads);
    }
    
    expect(allBlankNodeQuads.length).toBeGreaterThan(0);
    
    // Verify that if we were to set block.quads = currentQuads + allBlankNodeQuads,
    // we would have all the necessary quads for serialization
    const combinedQuads = [...currentQuads, ...allBlankNodeQuads];
    expect(combinedQuads.length).toBeGreaterThan(currentQuads.length);
    
    // Check that combined quads include blank node quads where blank is subject
    const blankAsSubject = combinedQuads.filter(q => q.subject.termType === 'BlankNode');
    expect(blankAsSubject.length).toBeGreaterThan(0);
  });
});
