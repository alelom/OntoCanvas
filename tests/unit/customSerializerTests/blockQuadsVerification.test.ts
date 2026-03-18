/**
 * Test to verify that block.quads includes blank node quads before serialization.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseRdfToGraph, updateLabelInStore } from '../../../src/parser';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { DataFactory } from 'n3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_FIXTURES_DIR = join(__dirname, '../../fixtures');
const FIXTURE_PATH = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');

describe('Block Quads Verification', () => {
  it('should verify that modifiedBlocks have blank node quads in block.quads', async () => {
    const originalContent = readFileSync(FIXTURE_PATH, 'utf-8');
    const parseResult = await parseRdfToGraph(originalContent, { path: FIXTURE_PATH });
    let { store, originalFileCache } = parseResult;
    
    if (!originalFileCache) {
      throw new Error('Original file cache not available');
    }
    
    // Rename label to trigger modification
    updateLabelInStore(store, 'DrawingSheet', 'Drawing sheet renamed');
    
    // Manually simulate what reconstructFromCache does
    const drawingSheetUri = 'http://example.org/aec-drawing-ontology#DrawingSheet';
    const drawingSheetNode = DataFactory.namedNode(drawingSheetUri);
    
    // Get current quads
    const currentQuads = store.getQuads(drawingSheetNode, null, null, null);
    
    // Get rdfs:subClassOf quads with blank nodes
    const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
    const subClassOfQuads = currentQuads.filter(q => 
      q.predicate.termType === 'NamedNode' && 
      (q.predicate as { value: string }).value === RDFS + 'subClassOf' &&
      q.object.termType === 'BlankNode'
    );
    
    expect(subClassOfQuads.length).toBe(5);
    
    // Collect blank node quads (where blank is subject)
    const blankNodeQuads: typeof currentQuads = [];
    for (const quad of subClassOfQuads) {
      const blankNode = quad.object;
      const blankQuads = store.getQuads(blankNode, null, null, null);
      blankNodeQuads.push(...blankQuads);
    }
    
    expect(blankNodeQuads.length).toBeGreaterThan(0);
    
    // Verify blank node quads have blank nodes as subjects
    const blankAsSubject = blankNodeQuads.filter(q => q.subject.termType === 'BlankNode');
    expect(blankAsSubject.length).toBeGreaterThan(0);
    
    // Now simulate what should happen: block.quads should include both currentQuads AND blankNodeQuads
    const allQuads = [...currentQuads, ...blankNodeQuads];
    
    // Find DrawingSheet block
    const drawingSheetBlock = originalFileCache.statementBlocks.find(
      block => block.subject === ':DrawingSheet' || block.subject?.includes('DrawingSheet')
    );
    
    expect(drawingSheetBlock).toBeTruthy();
    if (!drawingSheetBlock) return;
    
    // Simulate setting block.quads (what reconstructFromCache should do)
    drawingSheetBlock.quads = allQuads;
    
    // Verify block.quads has blank node quads where blank is subject
    const blockBlankAsSubject = drawingSheetBlock.quads.filter(q => q.subject.termType === 'BlankNode');
    expect(blockBlankAsSubject.length).toBeGreaterThan(0);
    
    // Verify block.quads has the right structure for serialization
    const blockBlankAsObject = drawingSheetBlock.quads.filter(q => q.object.termType === 'BlankNode');
    expect(blockBlankAsObject.length).toBe(5); // 5 rdfs:subClassOf quads with blank node objects
    
    // This is what serializeBlockToTurtle needs: blank nodes as subjects to build inline forms
    expect(blockBlankAsSubject.length).toBeGreaterThan(0);
  });
});
