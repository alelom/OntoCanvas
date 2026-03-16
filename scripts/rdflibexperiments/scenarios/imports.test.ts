/**
 * Test owl:imports preservation
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
 * Run imports preservation tests
 */
export async function runImportsTests(): Promise<ComparisonResult[]> {
  const results: ComparisonResult[] = [];

  // Test 1: Single import
  results.push(await testSingleImport());

  // Test 2: Multiple imports
  results.push(await testMultipleImports());

  // Test 3: Real-world example
  results.push(await testRealWorldExample());

  return results;
}

/**
 * Test 1: Single import
 */
async function testSingleImport(): Promise<ComparisonResult> {
  // Create a simple fixture with single import
  const original = `@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

<http://example.org/test> rdf:type owl:Ontology ;
    owl:imports <http://example.org/import1> .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test Class" .
`;

  // Parse with N3
  const parseResult = await parseRdfToGraph(original, { path: 'test.ttl' });
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
    ['imports'],
    'imports',
    'Single import'
  );
}

/**
 * Test 2: Multiple imports
 */
async function testMultipleImports(): Promise<ComparisonResult> {
  const fixturePath = join(FIXTURES_DIR, 'with-imports.ttl');
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
    ['imports'],
    'imports',
    'Multiple imports'
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
    ['imports'],
    'imports',
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
