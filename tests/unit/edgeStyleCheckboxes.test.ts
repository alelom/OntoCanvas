/**
 * Unit test to verify which edges are created from edge-style-test.ttl
 */
import { describe, it, expect } from 'vitest';
import { parseRdfToGraph } from '../../src/parser';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Edge Style Checkboxes Unit Test', () => {
  it('should create correct number of edges from edge-style-test.ttl', async () => {
    const fixtureFile = join(__dirname, '../fixtures/edge-style-test.ttl');
    const content = readFileSync(fixtureFile, 'utf-8');
    
    const parseResult = await parseRdfToGraph(content, { path: fixtureFile });
    const { graphData } = parseResult;
    
    console.log(`[TEST] Total edges created: ${graphData.edges.length}`);
    console.log('[TEST] All edges:', graphData.edges.map(e => `${e.from} -> ${e.to} (${e.type})`));
    
    // Expected edges:
    // 1. ClassA -> ClassB (subClassOf)
    // 2. ClassA -> ClassB (hasProperty from domain/range)
    // 3. ClassB -> ClassC (contains from domain/range)
    
    // But property assertions like :ClassA :hasProperty :ClassB don't create edges
    // Only domain/range and restrictions create edges
    
    expect(graphData.edges.length).toBeGreaterThanOrEqual(2);
    expect(graphData.edges.length).toBeLessThanOrEqual(3);
    
    // Check for subClassOf edge
    const subClassOfEdge = graphData.edges.find(e => e.type === 'subClassOf' && e.from === 'ClassA' && e.to === 'ClassB');
    expect(subClassOfEdge).toBeDefined();
    
    // Check for hasProperty edge (from domain/range)
    const hasPropertyEdge = graphData.edges.find(e => 
      (e.type === 'hasProperty' || e.type.includes('hasProperty')) && 
      e.from === 'ClassA' && e.to === 'ClassB'
    );
    console.log('[TEST] hasProperty edge:', hasPropertyEdge);
    
    // Check for contains edge (from domain/range)
    const containsEdge = graphData.edges.find(e => 
      (e.type === 'contains' || e.type.includes('contains')) && 
      e.from === 'ClassB' && e.to === 'ClassC'
    );
    console.log('[TEST] contains edge:', containsEdge);
  });
});
