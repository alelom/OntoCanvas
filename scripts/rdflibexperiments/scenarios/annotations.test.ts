/**
 * Test annotation property preservation
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
 * Run annotation property preservation tests
 */
export async function runAnnotationsTests(): Promise<ComparisonResult[]> {
  const results: ComparisonResult[] = [];

  // Test 1: Boolean annotations
  results.push(await testBooleanAnnotations());

  // Test 2: String annotations
  results.push(await testStringAnnotations());

  // Test 3: Multiple annotations
  results.push(await testMultipleAnnotations());

  // Test 4: Real-world example
  results.push(await testRealWorldExample());

  return results;
}

/**
 * Test 1: Boolean annotations
 */
async function testBooleanAnnotations(): Promise<ComparisonResult> {
  const fixturePath = join(FIXTURES_DIR, 'with-annotations.ttl');
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
    ['annotations'],
    'annotations',
    'Boolean annotations (:labellableRoot false)'
  );
}

/**
 * Test 2: String annotations
 */
async function testStringAnnotations(): Promise<ComparisonResult> {
  const fixturePath = join(FIXTURES_DIR, 'with-annotations.ttl');
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
    ['annotations'],
    'annotations',
    'String annotations (:exampleImage <uri>)'
  );
}

/**
 * Test 3: Multiple annotations on same class
 */
async function testMultipleAnnotations(): Promise<ComparisonResult> {
  const fixturePath = join(FIXTURES_DIR, 'with-annotations.ttl');
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
    ['annotations'],
    'annotations',
    'Multiple annotations on same class'
  );
}

/**
 * Test 4: Real-world example
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
    ['annotations'],
    'annotations',
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
