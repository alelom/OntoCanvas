/**
 * Unit tests for Option A: reliable targeted label replacement for blocks with restrictions.
 * When only the label (or similar simple property) changes, we must use block.originalText
 * + surgical replace so exact formatting (indentation, line breaks, spacing) is preserved.
 *
 * These tests verify:
 * - Exact formatting preserved for label-only change on blocks with blank node restrictions
 * - Original block lookup works (including fallback by subject)
 * - Restriction structure comparison allows targeted replacement when restrictions unchanged
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseRdfToGraph, updateLabelInStore, storeToTurtle } from '../../../src/parser';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_FIXTURES_DIR = join(__dirname, '../../fixtures');
const AEC_FIXTURE_PATH = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');
const MULTI_LINE_RESTRICTION_PATH = join(TEST_FIXTURES_DIR, 'customSerializerFixtures', 'multi-line-restriction.ttl');

/** Extract the first :DrawingSheet (or :TestClass) block from content - from subject line to trailing period + newline */
function extractBlock(content: string, subjectLocalName: string): string | null {
  // Accept either "rdf:type owl:Class" or "a owl:Class" (N3 Writer may abbreviate)
  const pattern = new RegExp(
    `(:${subjectLocalName}\\s+(?:rdf:type|a)\\s+owl:Class[\\s\\S]*?\\.)(?:\\s*(?:\\r?\\n)|$)`,
    'm'
  );
  const match = content.match(pattern);
  return match ? match[1].trimEnd() : null;
}

/** Build expected block from original by replacing only the label line value */
function expectedBlockWithNewLabel(originalBlock: string, oldLabel: string, newLabel: string): string {
  const escapedOld = oldLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return originalBlock.replace(
    new RegExp(`(rdfs:label\\s+")${escapedOld}(")`, ''),
    (_, before, after) => `${before}${newLabel.replace(/"/g, '\\"')}${after}`
  );
}

describe('Targeted label replacement (Option A)', () => {
  it('serialization output must not depend on DEBUG env (same result with and without)', async () => {
    const originalContent = readFileSync(MULTI_LINE_RESTRICTION_PATH, 'utf-8');
    const run = async (): Promise<string> => {
      const parseResult = await parseRdfToGraph(originalContent, { path: MULTI_LINE_RESTRICTION_PATH });
      const { store, originalFileCache } = parseResult;
      if (!originalFileCache) throw new Error('No cache');
      updateLabelInStore(store, 'TestClass', 'Test Class Renamed');
      return storeToTurtle(store, undefined, originalContent, originalFileCache, 'custom');
    };
    const debugBefore = process.env.DEBUG;
    const ontologyBefore = process.env.ONTOLOGY_EDITOR_DEBUG;
    try {
      delete process.env.DEBUG;
      delete process.env.ONTOLOGY_EDITOR_DEBUG;
      const withoutDebug = await run();
      process.env.DEBUG = 'true';
      const withDebug = await run();
      expect(withDebug).toBe(withoutDebug);
    } finally {
      if (debugBefore !== undefined) process.env.DEBUG = debugBefore;
      else delete process.env.DEBUG;
      if (ontologyBefore !== undefined) process.env.ONTOLOGY_EDITOR_DEBUG = ontologyBefore;
      else delete process.env.ONTOLOGY_EDITOR_DEBUG;
    }
  });

  it('should preserve exact formatting of DrawingSheet block when only label changes', async () => {
    const originalContent = readFileSync(AEC_FIXTURE_PATH, 'utf-8');
    const parseResult = await parseRdfToGraph(originalContent, { path: AEC_FIXTURE_PATH });
    const { store, originalFileCache } = parseResult;

    if (!originalFileCache) {
      throw new Error('Original file cache not available');
    }

    const originalBlock = extractBlock(originalContent, 'DrawingSheet');
    expect(originalBlock).toBeTruthy();
    expect(originalBlock).toContain('rdfs:label "Drawing sheet"');
    expect(originalBlock).toMatch(/rdfs:subClassOf\s+\[/);

    updateLabelInStore(store, 'DrawingSheet', 'Drawing sheet renamed');

    const serialized = await storeToTurtle(
      store,
      undefined,
      originalContent,
      originalFileCache,
      'custom'
    );

    const serializedBlock = extractBlock(serialized, 'DrawingSheet');
    expect(serializedBlock).toBeTruthy();
    expect(serializedBlock).toContain('rdfs:label "Drawing sheet renamed"');

    const expected = expectedBlockWithNewLabel(originalBlock!, 'Drawing sheet', 'Drawing sheet renamed');
    expect(serializedBlock).toBe(expected);
  });

  it('should preserve exact line structure of multi-line restriction when only label changes', async () => {
    const originalContent = readFileSync(MULTI_LINE_RESTRICTION_PATH, 'utf-8');
    const parseResult = await parseRdfToGraph(originalContent, { path: MULTI_LINE_RESTRICTION_PATH });
    const { store, originalFileCache } = parseResult;

    if (!originalFileCache) {
      throw new Error('Original file cache not available');
    }

    const originalBlock = extractBlock(originalContent, 'TestClass');
    expect(originalBlock).toBeTruthy();
    expect(originalBlock).toContain('rdfs:label "Test Class"');
    expect(originalBlock).toMatch(/rdfs:subClassOf\s+\[\s*rdf:type\s+owl:Restriction/);

    updateLabelInStore(store, 'TestClass', 'Test Class Renamed');

    const serialized = await storeToTurtle(
      store,
      undefined,
      originalContent,
      originalFileCache,
      'custom'
    );

    const serializedBlock = extractBlock(serialized, 'TestClass');
    expect(serializedBlock).toBeTruthy();
    expect(serializedBlock).toContain('rdfs:label "Test Class Renamed"');

    const expected = expectedBlockWithNewLabel(originalBlock!, 'Test Class', 'Test Class Renamed');
    expect(serializedBlock).toBe(expected);
  });

  it('should preserve restriction line breaks and indentation for DrawingSheet (no reflow)', async () => {
    const originalContent = readFileSync(AEC_FIXTURE_PATH, 'utf-8');
    const parseResult = await parseRdfToGraph(originalContent, { path: AEC_FIXTURE_PATH });
    const { store, originalFileCache } = parseResult;

    if (!originalFileCache) {
      throw new Error('Original file cache not available');
    }

    updateLabelInStore(store, 'DrawingSheet', 'Drawing sheet renamed');

    const serialized = await storeToTurtle(
      store,
      undefined,
      originalContent,
      originalFileCache,
      'custom'
    );

    const originalBlock = extractBlock(originalContent, 'DrawingSheet');
    const serializedBlock = extractBlock(serialized, 'DrawingSheet');
    expect(originalBlock).toBeTruthy();
    expect(serializedBlock).toBeTruthy();

    const originalLines = originalBlock!.split(/\r?\n/);
    const serializedLines = serializedBlock!.split(/\r?\n/);

    expect(serializedLines.length).toBe(originalLines.length);

    for (let i = 0; i < originalLines.length; i++) {
      const orig = originalLines[i];
      const ser = serializedLines[i];
      if (orig.includes('rdfs:label "Drawing sheet"')) {
        expect(ser).toContain('rdfs:label "Drawing sheet renamed"');
        continue;
      }
      expect(ser).toBe(orig);
    }
  });
});
