/**
 * Test blank node serialization with inline forms
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

export interface BlankNodeTestResult {
  testCase: string;
  result: ComparisonResult;
}

/**
 * Run blank node serialization tests
 */
export async function runBlankNodeTests(): Promise<ComparisonResult[]> {
  const results: ComparisonResult[] = [];

  // Test 1: Simple restriction
  results.push(await testSimpleRestriction());

  // Test 2: Multiple restrictions (like DrawingSheet)
  results.push(await testMultipleRestrictions());

  // Test 3: Nested blank nodes
  results.push(await testNestedBlankNodes());

  // Test 4: Real-world example (aec_drawing_metadata.ttl)
  results.push(await testRealWorldExample());

  return results;
}

/**
 * Test 1: Simple restriction (one blank node)
 */
async function testSimpleRestriction(): Promise<ComparisonResult> {
  const fixturePath = join(FIXTURES_DIR, 'simple-restriction.ttl');
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
    ['blank-node-definitions', 'blank-node-inline-forms'],
    'blankNodes',
    'Simple restriction (one blank node)'
  );
}

/**
 * Test 2: Multiple restrictions (4 blank nodes like DrawingSheet)
 */
async function testMultipleRestrictions(): Promise<ComparisonResult> {
  const fixturePath = join(FIXTURES_DIR, 'multiple-restrictions.ttl');
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
    ['blank-node-definitions', 'blank-node-inline-forms'],
    'blankNodes',
    'Multiple restrictions (4 blank nodes)'
  );
}

/**
 * Test 3: Nested blank nodes
 */
async function testNestedBlankNodes(): Promise<ComparisonResult> {
  const fixturePath = join(FIXTURES_DIR, 'nested-blank-nodes.ttl');
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
    ['blank-node-definitions', 'blank-node-inline-forms'],
    'blankNodes',
    'Nested blank nodes'
  );
}

/**
 * Test 4: Real-world example (aec_drawing_metadata.ttl)
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
    ['blank-node-definitions', 'blank-node-inline-forms'],
    'blankNodes',
    'Real-world example (aec_drawing_metadata.ttl)'
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
