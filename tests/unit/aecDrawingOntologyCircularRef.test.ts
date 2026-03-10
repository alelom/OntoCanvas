/**
 * Unit test to verify circular reference detection bug in aec_drawing_ontology.ttl.
 * 
 * The ontology is valid according to external tools, but our validator incorrectly
 * reports circular references. This test reproduces the issue and verifies the fix.
 */
import { describe, it, expect } from 'vitest';
import { parseRdfToGraph } from '../../src/parser';
import { validateOntologyStructure } from '../../src/lib/ontologyValidation';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('AEC Drawing Ontology Circular Reference Detection', () => {
  it('should not report false circular references for valid ontology', async () => {
    const ontologyFile = join(__dirname, '../fixtures/aec_drawing_ontology.ttl');
    const content = readFileSync(ontologyFile, 'utf-8');
    
    // Parse the ontology
    const parseResult = await parseRdfToGraph(content, { path: ontologyFile });
    const { graphData } = parseResult;
    
    // Validate the ontology structure
    const validationResult = validateOntologyStructure(graphData.nodes, graphData.edges);
    
    // Log the errors for debugging
    if (!validationResult.isValid) {
      console.log('[TEST] Validation errors found:', validationResult.errors.length);
      console.log('[TEST] First 10 errors:');
      validationResult.errors.slice(0, 10).forEach((error, idx) => {
        console.log(`[TEST] Error ${idx + 1}:`, error.message);
        if (error.details?.nodes) {
          console.log(`[TEST]   Nodes in cycle:`, error.details.nodes);
        }
        if (error.details?.edges) {
          console.log(`[TEST]   Edges in cycle:`, error.details.edges);
        }
      });
      
      // Check for the specific false positive errors mentioned
      const circularRefErrors = validationResult.errors.filter(e => e.type === 'circular_reference');
      console.log('[TEST] Circular reference errors:', circularRefErrors.length);
      
      // Log some specific false positives
      const orientationDetailCycle = circularRefErrors.find(e => 
        e.message.includes('Orientation') && e.message.includes('Detail') && e.message.includes('DrawingType')
      );
      if (orientationDetailCycle) {
        console.log('[TEST] Found Orientation->Detail->DrawingType->Orientation false positive:', orientationDetailCycle.message);
        console.log('[TEST]   Details:', orientationDetailCycle.details);
      }
      
      // Check what edges exist for Detail, DrawingType, and Orientation
      const detailEdges = graphData.edges.filter(e => e.from === 'Detail' || e.to === 'Detail');
      const drawingTypeEdges = graphData.edges.filter(e => e.from === 'DrawingType' || e.to === 'DrawingType');
      const orientationEdges = graphData.edges.filter(e => e.from === 'Orientation' || e.to === 'Orientation');
      
      console.log('[TEST] Detail edges:', detailEdges.map(e => `${e.from} -> ${e.to} (${e.type})`));
      console.log('[TEST] DrawingType edges:', drawingTypeEdges.map(e => `${e.from} -> ${e.to} (${e.type})`));
      console.log('[TEST] Orientation edges:', orientationEdges.map(e => `${e.from} -> ${e.to} (${e.type})`));
    }
    
    // The ontology is valid, so it should pass validation
    // This test will fail initially, demonstrating the bug
    expect(validationResult.isValid).toBe(true);
    expect(validationResult.errors.filter(e => e.type === 'circular_reference').length).toBe(0);
  });
});
