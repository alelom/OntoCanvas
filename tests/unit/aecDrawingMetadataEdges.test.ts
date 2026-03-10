/**
 * Unit tests for verifying that only the correct edges are created from aec_drawing_metadata.ttl.
 * 
 * The issue: Properties with owl:Thing as domain/range were creating edges from ALL classes to ALL classes.
 * This test verifies that only edges from actual restrictions are created, not from owl:Thing domain/range.
 */
import { describe, it, expect } from 'vitest';
import { parseRdfToGraph } from '../../src/parser';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('AEC Drawing Metadata Edges', () => {
  it('should only create edges from restrictions, not from owl:Thing domain/range', async () => {
    const fixtureFile = join(__dirname, '../fixtures/aec_drawing_metadata.ttl');
    const content = readFileSync(fixtureFile, 'utf-8');
    
    const parseResult = await parseRdfToGraph(content, { path: fixtureFile });
    const { graphData } = parseResult;
    
    // Count total edges
    const totalEdges = graphData.edges.length;
    console.log(`[TEST] Total edges created: ${totalEdges}`);
    console.log('[TEST] All edges:', graphData.edges.map(e => `${e.from} -> ${e.to} (${e.type})`));
    
    // Expected edges from restrictions:
    // 1. DrawingSheet -> Note (via :contains restriction)
    // 2. DrawingSheet -> RevisionTable (via :contains restriction)
    // 3. DrawingSheet -> Layout (via :contains restriction)
    // 4. DrawingSheet -> DrawingOrientation (via :has restriction)
    // 5. Layout -> DrawingElement (external, via :contains restriction)
    // 6. Layout -> DrawingType (via :has restriction)
    // 7. Detail -> Orientation (via :has restriction)
    // 8. Detail -> DrawingType (via :has restriction - wait, Detail has subClassOf DrawingType, not a restriction)
    
    // Expected subClassOf edges:
    // 1. TextualNote -> Note
    // 2. Note -> Metadata
    // 3. RevisionTable -> Metadata
    // 4. Titleblock -> Metadata
    // 5. Legend -> Metadata
    // 6. Image -> Note
    // 7. Plan -> DrawingType
    // 8. Section -> DrawingType
    // 9. Elevation -> DrawingType
    // 10. Detail -> DrawingType
    // 11. Perspective -> DrawingType
    // 12. DrawingOrientation -> Portrait
    // 13. DrawingOrientation -> Landscape
    // 14. Base -> DetailLocation
    // 15. Corner -> DetailLocation
    // 16. Head -> DetailLocation
    // 17. SlabEdge -> DetailLocation
    // 18. Typical -> DetailLocation
    // 19. Horizontal -> Orientation
    // 20. Vertical -> Orientation
    
    // Count edges by type
    const subClassOfEdges = graphData.edges.filter(e => e.type === 'subClassOf');
    const containsEdges = graphData.edges.filter(e => e.type === 'contains' || e.type.includes('contains'));
    const hasEdges = graphData.edges.filter(e => e.type === 'has' || e.type.includes('has'));
    
    console.log(`[TEST] subClassOf edges: ${subClassOfEdges.length}`);
    console.log(`[TEST] contains edges: ${containsEdges.length}`);
    console.log(`[TEST] has edges: ${hasEdges.length}`);
    
    // Verify we have the expected restriction edges
    const drawingSheetToNote = graphData.edges.find(e => e.from === 'DrawingSheet' && e.to === 'Note' && (e.type === 'contains' || e.type.includes('contains')));
    const drawingSheetToRevisionTable = graphData.edges.find(e => e.from === 'DrawingSheet' && e.to === 'RevisionTable' && (e.type === 'contains' || e.type.includes('contains')));
    const drawingSheetToLayout = graphData.edges.find(e => e.from === 'DrawingSheet' && e.to === 'Layout' && (e.type === 'contains' || e.type.includes('contains')));
    const drawingSheetToDrawingOrientation = graphData.edges.find(e => e.from === 'DrawingSheet' && e.to === 'DrawingOrientation' && (e.type === 'has' || e.type.includes('has')));
    const layoutToDrawingType = graphData.edges.find(e => e.from === 'Layout' && e.to === 'DrawingType' && (e.type === 'has' || e.type.includes('has')));
    const detailToOrientation = graphData.edges.find(e => e.from === 'Detail' && e.to === 'Orientation' && (e.type === 'has' || e.type.includes('has')));
    
    // Log all DrawingSheet edges to debug
    const drawingSheetEdges = graphData.edges.filter(e => e.from === 'DrawingSheet');
    console.log('[TEST] DrawingSheet edges:', drawingSheetEdges.map(e => `${e.from} -> ${e.to} (${e.type})`));
    
    // Log all Layout edges to debug
    const layoutEdges = graphData.edges.filter(e => e.from === 'Layout');
    console.log('[TEST] Layout edges:', layoutEdges.map(e => `${e.from} -> ${e.to} (${e.type})`));
    
    expect(drawingSheetToNote).toBeDefined();
    expect(drawingSheetToRevisionTable).toBeDefined();
    expect(drawingSheetToLayout).toBeDefined();
    expect(drawingSheetToDrawingOrientation).toBeDefined();
    expect(layoutToDrawingType).toBeDefined();
    expect(detailToOrientation).toBeDefined();
    
    // Verify we have the expected subClassOf edges
    const textualNoteToNote = graphData.edges.find(e => e.from === 'TextualNote' && e.to === 'Note' && e.type === 'subClassOf');
    const noteToMetadata = graphData.edges.find(e => e.from === 'Note' && e.to === 'Metadata' && e.type === 'subClassOf');
    const detailToDrawingType = graphData.edges.find(e => e.from === 'Detail' && e.to === 'DrawingType' && e.type === 'subClassOf');
    
    expect(textualNoteToNote).toBeDefined();
    expect(noteToMetadata).toBeDefined();
    expect(detailToDrawingType).toBeDefined();
    
    // The critical test: we should NOT have edges from ALL classes to ALL classes
    // If :contains and :has have owl:Thing as domain/range, we should NOT create
    // edges between every pair of classes.
    
    // Count how many classes we have
    const classCount = graphData.nodes.length;
    console.log(`[TEST] Total classes: ${classCount}`);
    
    // If the bug exists, we would have approximately classCount * (classCount - 1) * 2 edges
    // (one for :contains and one for :has, excluding self-loops)
    // For example, with 25 classes, that would be 25 * 24 * 2 = 1200 edges!
    
    // The expected number of edges should be much smaller:
    // - ~7 restriction edges (contains/has)
    // - ~20 subClassOf edges
    // Total: ~27 edges
    
    // With the bug, we'd have way more edges. Let's verify we don't have excessive edges.
    // A reasonable upper bound: if we have 25 classes, we should have at most ~50 edges total
    // (allowing some margin for external references and other valid edges)
    const maxExpectedEdges = classCount * 3; // Reasonable upper bound: 3 edges per class on average
    
    console.log(`[TEST] Expected max edges: ${maxExpectedEdges}, Actual: ${totalEdges}`);
    
    // This test will fail if the bug exists (too many edges)
    expect(totalEdges).toBeLessThan(maxExpectedEdges);
    
    // More specifically, verify we don't have edges between classes that shouldn't be connected
    // For example, we shouldn't have :contains or :has edges between unrelated classes
    // like Portrait -> Landscape, or Base -> Corner, etc.
    const portraitToLandscape = graphData.edges.find(e => 
      e.from === 'Portrait' && e.to === 'Landscape' && 
      (e.type === 'contains' || e.type.includes('contains') || e.type === 'has' || e.type.includes('has'))
    );
    const baseToCorner = graphData.edges.find(e => 
      e.from === 'Base' && e.to === 'Corner' && 
      (e.type === 'contains' || e.type.includes('contains') || e.type === 'has' || e.type.includes('has'))
    );
    
    // These edges should NOT exist (they're not in restrictions)
    expect(portraitToLandscape).toBeUndefined();
    expect(baseToCorner).toBeUndefined();
  });
});
