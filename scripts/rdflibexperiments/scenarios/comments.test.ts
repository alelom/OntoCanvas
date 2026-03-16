/**
 * Test comment preservation
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../../src/parser.js';
import { convertN3QuadsToRdflibStatements } from '../utils/n3ToRdflib.js';
import { serializeWithRdflib } from '../utils/rdflibSerializer.js';
import { compareOutputs, type ComparisonResult } from '../utils/comparison.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_DIR = join(__dirname, '../fixtures');
const TEST_FIXTURES_DIR = join(__dirname, '../../../tests/fixtures');

/**
 * Run comment preservation tests
 */
export async function runCommentsTests(): Promise<ComparisonResult[]> {
  const results: ComparisonResult[] = [];

  // Test 1: Section divider comments
  results.push(await testSectionDividers());

  // Test 2: Inline comments
  results.push(await testInlineComments());

  // Test 3: Comments-only file
  results.push(await testCommentsOnly());

  // Test 4: Real-world example with comments
  results.push(await testRealWorldExample());

  return results;
}

/**
 * Test 1: Section divider comments
 */
async function testSectionDividers(): Promise<ComparisonResult> {
  const fixturePath = join(FIXTURES_DIR, 'with-comments.ttl');
  const original = readFileSync(fixturePath, 'utf-8');

  // Parse with N3
  const parseResult = await parseRdfToGraph(original, { path: fixturePath });
  const { store } = parseResult;

  // Convert to rdflib
  const quads = Array.from(store);
  const statements = convertN3QuadsToRdflibStatements(quads);

  // Serialize with rdflib
  const serialized = await serializeWithRdflib(statements, 'text/turtle', {
    prefixes: extractPrefixes(original)
  });

  // Compare
  return compareOutputs(
    original,
    serialized,
    ['comments'],
    'comments',
    'Section divider comments (################################)'
  );
}

/**
 * Test 2: Inline comments
 */
async function testInlineComments(): Promise<ComparisonResult> {
  const fixturePath = join(TEST_FIXTURES_DIR, 'comments-complex.ttl');
  const original = readFileSync(fixturePath, 'utf-8');

  // Parse with N3
  const parseResult = await parseRdfToGraph(original, { path: fixturePath });
  const { store } = parseResult;

  // Convert to rdflib
  const quads = Array.from(store);
  const statements = convertN3QuadsToRdflibStatements(quads);

  // Serialize with rdflib
  const serialized = await serializeWithRdflib(statements, 'text/turtle', {
    prefixes: extractPrefixes(original)
  });

  // Compare
  return compareOutputs(
    original,
    serialized,
    ['comments'],
    'comments',
    'Inline comments (# inline comment)'
  );
}

/**
 * Test 3: Comments-only file
 */
async function testCommentsOnly(): Promise<ComparisonResult> {
  const fixturePath = join(TEST_FIXTURES_DIR, 'only-comments.ttl');
  const original = readFileSync(fixturePath, 'utf-8');

  // Parse with N3 (may fail or return empty store)
  try {
    const parseResult = await parseRdfToGraph(original, { path: fixturePath });
    const { store } = parseResult;

    // Convert to rdflib
    const quads = Array.from(store);
    const statements = convertN3QuadsToRdflibStatements(quads);

    // Serialize with rdflib
    const serialized = await serializeWithRdflib(statements, 'text/turtle', {
      prefixes: extractPrefixes(original)
    });

    // Compare
    return compareOutputs(
      original,
      serialized,
      ['comments'],
      'comments',
      'Comments-only file'
    );
  } catch (error) {
    // If parsing fails (no RDF content), that's expected
    return {
      scenario: 'comments',
      testCase: 'Comments-only file',
      passed: false,
      issues: ['File contains only comments, no RDF content to serialize'],
      warnings: [],
      original,
      serialized: '',
      requirements: [{
        name: 'comments',
        passed: false,
        message: 'Cannot test: file has no RDF content'
      }]
    };
  }
}

/**
 * Test 4: Real-world example with comments
 */
async function testRealWorldExample(): Promise<ComparisonResult> {
  const fixturePath = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');
  const original = readFileSync(fixturePath, 'utf-8');

  // Parse with N3
  const parseResult = await parseRdfToGraph(original, { path: fixturePath });
  const { store } = parseResult;

  // Convert to rdflib
  const quads = Array.from(store);
  const statements = convertN3QuadsToRdflibStatements(quads);

  // Serialize with rdflib
  const serialized = await serializeWithRdflib(statements, 'text/turtle', {
    prefixes: extractPrefixes(original)
  });

  // Compare
  return compareOutputs(
    original,
    serialized,
    ['comments'],
    'comments',
    'Real-world example with comments (aec_drawing_metadata.ttl)'
  );
}

/**
 * Extract prefix map from Turtle content
 */
function extractPrefixes(content: string): Record<string, string> {
  const prefixes: Record<string, string> = {};
  const prefixPattern = /@prefix\s+(\w+)?:\s*<([^>]+)>/g;
  let match;

  while ((match = prefixPattern.exec(content)) !== null) {
    const prefix = match[1] || '';
    const namespace = match[2];
    prefixes[prefix] = namespace;
  }

  return prefixes;
}
