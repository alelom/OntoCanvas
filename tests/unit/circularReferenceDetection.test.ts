/**
 * Unit tests for circular reference detection in ontologies.
 * These tests verify the validation logic without DOM interactions.
 */
import { describe, it, expect } from 'vitest';
import { parseRdfToGraph } from '../../src/parser';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { validateOntologyStructure } from '../../src/lib/ontologyValidation';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Circular Reference Detection Unit Tests', () => {
  it('should detect circular reference (A->B->C->A)', async () => {
    const testFile = join(__dirname, '../fixtures/potentially-corrupt-ontology-02-circular.ttl');
    const content = readFileSync(testFile, 'utf-8');
    
    const parseResult = await parseRdfToGraph(content, { path: testFile });
    const { graphData } = parseResult;
    
    const validationResult = validateOntologyStructure(graphData.nodes, graphData.edges);
    
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errors.length).toBeGreaterThan(0);
    expect(validationResult.errors.some(e => e.type === 'circular_reference')).toBe(true);
    
    // Check that error message contains "circular"
    const errorMessages = validationResult.errors.map(e => e.message.toLowerCase()).join(' ');
    expect(errorMessages).toContain('circular');
  });
  
  it('should detect self-referential class', async () => {
    const testFile = join(__dirname, '../fixtures/potentially-corrupt-ontology-03-self-reference.ttl');
    const content = readFileSync(testFile, 'utf-8');
    
    const parseResult = await parseRdfToGraph(content, { path: testFile });
    const { graphData } = parseResult;
    
    const validationResult = validateOntologyStructure(graphData.nodes, graphData.edges);
    
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errors.length).toBeGreaterThan(0);
    expect(validationResult.errors.some(e => e.type === 'circular_reference')).toBe(true);
    
    // Check that error message contains "circular", "self", or "reference"
    const errorMessages = validationResult.errors.map(e => e.message.toLowerCase()).join(' ');
    expect(errorMessages).toMatch(/circular|self|reference/);
  });
});
