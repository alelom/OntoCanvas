import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseRdfToGraph, updateLabelInStore, storeToTurtle } from '../../../src/parser';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_FIXTURES_DIR = join(__dirname, '../../fixtures');
const FIXTURE_PATH = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');

describe('Debug Serialization', () => {
  it('should debug what serializeBlockToTurtle produces for DrawingSheet', async () => {
    const originalContent = readFileSync(FIXTURE_PATH, 'utf-8');
    const parseResult = await parseRdfToGraph(originalContent, { path: FIXTURE_PATH });
    const { store, originalFileCache } = parseResult;

    if (!originalFileCache) {
      throw new Error('Original file cache not available');
    }

    // Rename label
    updateLabelInStore(store, 'DrawingSheet', 'Drawing sheet renamed');

    // Serialize
    const serialized = await storeToTurtle(
      store,
      undefined,
      originalContent,
      originalFileCache,
      'custom'
    );

    // Extract DrawingSheet block
    const drawingSheetMatch = serialized.match(/:DrawingSheet[\s\S]*?\./);
    if (!drawingSheetMatch) {
      console.log('DrawingSheet block not found in serialized output');
      console.log('Serialized output (first 2000 chars):', serialized.substring(0, 2000));
      throw new Error('DrawingSheet block not found');
    }

    const drawingSheetBlock = drawingSheetMatch[0];
    console.log('DrawingSheet block:');
    console.log(drawingSheetBlock);
    console.log('');
    console.log('DrawingSheet block length:', drawingSheetBlock.length);
    console.log('Contains rdfs:subClassOf:', drawingSheetBlock.includes('rdfs:subClassOf'));
    console.log('Full serialized output (first 3000 chars):');
    console.log(serialized.substring(0, 3000));
    console.log('Contains rdfs:label:', drawingSheetBlock.includes('rdfs:label'));
    console.log('Contains rdfs:comment:', drawingSheetBlock.includes('rdfs:comment'));
    console.log('Contains a owl:Class:', drawingSheetBlock.includes('a owl:Class') || drawingSheetBlock.includes('rdf:type owl:Class'));

    // This test is just for debugging - no assertions
    expect(drawingSheetBlock.length).toBeGreaterThan(0);
  });
});
