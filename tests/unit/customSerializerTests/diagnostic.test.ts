import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseRdfToGraph } from '../../../src/parser';
import { extractPropertyLines, type OriginalFileCache } from '../../../src/rdf/sourcePreservation';

const TEST_FIXTURES_DIR = join(__dirname, '../../fixtures');

describe('Diagnostic: Property Line Extraction', () => {
  it('should correctly extract property lines for :exampleImage block', async () => {
    const fixturePath = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');
    const originalContent = readFileSync(fixturePath, 'utf-8');
    
    const parseResult = await parseRdfToGraph(originalContent, { path: fixturePath });
    const { originalFileCache } = parseResult;
    
    if (!originalFileCache) {
      throw new Error('Original file cache not available');
    }
    
    // Find :exampleImage block
    // Try multiple subject formats
    let exampleImageBlock = originalFileCache.statementBlocks.find(
      block => block.subject === 'https://burohappoldmachinelearning.github.io/ADIRO/aec_drawing_metadata#exampleImage'
    );
    
    if (!exampleImageBlock) {
      // Try with : prefix
      exampleImageBlock = originalFileCache.statementBlocks.find(
        block => block.subject === ':exampleImage' || block.subject?.includes('exampleImage')
      );
    }
    
    expect(exampleImageBlock).toBeDefined();
    if (!exampleImageBlock) {
      // Debug: list all block subjects
      const allSubjects = originalFileCache.statementBlocks.map(b => b.subject).filter(Boolean);
      console.log('Available block subjects:', allSubjects.slice(0, 20));
      return;
    }
    
    console.log('Block originalText:', JSON.stringify(exampleImageBlock.originalText));
    console.log('Block position:', exampleImageBlock.position);
    
    const propertyLines = extractPropertyLines(exampleImageBlock, originalFileCache);
    
    console.log('Extracted property lines:', propertyLines.length);
    for (const propLine of propertyLines) {
      console.log(`  - ${propLine.predicate}: start=${propLine.position.start}, end=${propLine.position.end}, text="${propLine.originalLineText.substring(0, 50)}..."`);
      console.log(`    Quads: ${propLine.quads.length}`);
    }
    
    // Check for overlaps
    for (let i = 0; i < propertyLines.length; i++) {
      for (let j = i + 1; j < propertyLines.length; j++) {
        const p1 = propertyLines[i];
        const p2 = propertyLines[j];
        const overlaps = !(p1.position.end <= p2.position.start || p2.position.end <= p1.position.start);
        if (overlaps) {
          console.error(`OVERLAP DETECTED: ${p1.predicate} (${p1.position.start}-${p1.position.end}) overlaps with ${p2.predicate} (${p2.position.start}-${p2.position.end})`);
        }
      }
    }
    
    // Verify we have the expected properties
    const predicates = propertyLines.map(p => p.predicate);
    expect(predicates).toContain('rdf:type');
    expect(predicates).toContain('rdfs:label');
    expect(predicates).toContain('rdfs:comment');
  });
});
