import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseRdfToGraph, updateLabelInStore } from '../../../src/parser';
import { buildInlineForms } from '../../../src/turtlePostProcess';
import { DataFactory } from 'n3';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_FIXTURES_DIR = join(__dirname, '../../fixtures');
const FIXTURE_PATH = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');

describe('buildInlineForms Debug', () => {
  it('should verify that block.quads contains blank node quads where blank nodes are subjects', async () => {
    const originalContent = readFileSync(FIXTURE_PATH, 'utf-8');
    const parseResult = await parseRdfToGraph(originalContent, { path: FIXTURE_PATH });
    const { store, originalFileCache } = parseResult;

    if (!originalFileCache) {
      throw new Error('Original file cache not available');
    }

    // Rename label
    updateLabelInStore(store, 'DrawingSheet', 'Drawing sheet renamed');

    // Find DrawingSheet block
    const drawingSheetBlock = originalFileCache.statementBlocks.find(
      (block) => block.subject?.includes('DrawingSheet')
    );

    expect(drawingSheetBlock).toBeTruthy();
    if (!drawingSheetBlock) return;

    // Get current quads for DrawingSheet from store
    const drawingSheetSubjectUri = store.getQuads(null, null, null, null).find(
      (q) => q.subject.value.includes('DrawingSheet')
    )?.subject.value;

    expect(drawingSheetSubjectUri).toBeTruthy();
    if (!drawingSheetSubjectUri) return;

    const currentDrawingSheetQuads = store.getQuads(
      DataFactory.namedNode(drawingSheetSubjectUri),
      null,
      null,
      null
    );

    console.log('Current DrawingSheet quads:', currentDrawingSheetQuads.length);
    
    // Find blank nodes in subClassOf quads
    const subClassOfQuads = currentDrawingSheetQuads.filter(
      q => (q.predicate as { value: string }).value.includes('subClassOf')
    );
    console.log('subClassOf quads:', subClassOfQuads.length);

    const blankNodeIds = new Set<string>();
    for (const q of subClassOfQuads) {
      if (q.object.termType === 'BlankNode') {
        const blankId = (q.object as { id?: string; value?: string }).id || 
                       (q.object as { id?: string; value?: string }).value || '';
        if (blankId) {
          blankNodeIds.add(blankId.startsWith('_:') ? blankId.slice(2) : blankId);
        }
      }
    }
    console.log('Blank node IDs from subClassOf:', Array.from(blankNodeIds));

    // Get blank node quads from store
    const blankNodeQuads: typeof currentDrawingSheetQuads = [];
    for (const blankId of blankNodeIds) {
      const blankNode = DataFactory.blankNode(blankId);
      const quads = store.getQuads(blankNode, null, null, null);
      console.log(`Blank node ${blankId} has ${quads.length} quads in store`);
      blankNodeQuads.push(...quads);
    }
    console.log('Total blank node quads:', blankNodeQuads.length);

    // Combine current quads with blank node quads
    const allQuads = [...currentDrawingSheetQuads, ...blankNodeQuads];
    console.log('Total quads for buildInlineForms:', allQuads.length);

    // Count blank nodes as subjects vs objects
    const blankAsSubject = allQuads.filter(q => q.subject.termType === 'BlankNode').length;
    const blankAsObject = allQuads.filter(q => q.object.termType === 'BlankNode').length;
    console.log('Blank nodes as SUBJECT:', blankAsSubject);
    console.log('Blank nodes as OBJECT:', blankAsObject);

    // Try buildInlineForms
    const inlineForms = buildInlineForms(allQuads, undefined, true);
    console.log('Inline forms built:', inlineForms.size);
    for (const [id, form] of inlineForms.entries()) {
      console.log(`Inline form for ${id}:`, form);
      expect(form.trim()).not.toBe('[]');
      expect(form.trim()).not.toBe('[  ]');
    }

    // This test verifies that when we have the correct quads, buildInlineForms works
    expect(blankAsSubject).toBeGreaterThan(0);
    expect(inlineForms.size).toBeGreaterThan(0);
  });
});
