/**
 * Test property order preservation
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
 * Run property order preservation tests
 */
export async function runPropertyOrderTests(): Promise<ComparisonResult[]> {
  const results: ComparisonResult[] = [];

  // Test 1: Class with restrictions (subClassOf, label, comment, type, annotation)
  results.push(await testClassWithRestrictions());

  // Test 2: Simple class (label, comment, type)
  results.push(await testSimpleClass());

  // Test 3: Real-world example
  results.push(await testRealWorldExample());

  return results;
}

/**
 * Test 1: Class with restrictions
 */
async function testClassWithRestrictions(): Promise<ComparisonResult> {
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
    ['property-order'],
    'propertyOrder',
    'Class with restrictions (subClassOf, label, comment, type, annotation)'
  );
}

/**
 * Test 2: Simple class
 */
async function testSimpleClass(): Promise<ComparisonResult> {
  const fixturePath = join(TEST_FIXTURES_DIR, 'colon-notation-test.ttl');
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
    ['property-order'],
    'propertyOrder',
    'Simple class (label, comment, type)'
  );
}

/**
 * Test 3: Real-world example
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
    ['property-order'],
    'propertyOrder',
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
