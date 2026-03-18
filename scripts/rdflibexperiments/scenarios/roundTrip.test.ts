/**
 * Test parse → serialize → parse consistency (round-trip)
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
 * Run round-trip consistency tests
 */
export async function runRoundTripTests(): Promise<ComparisonResult[]> {
  const results: ComparisonResult[] = [];

  // Test 1: Round-trip with restrictions
  results.push(await testRoundTripWithRestrictions());

  // Test 2: Round-trip with annotations
  results.push(await testRoundTripWithAnnotations());

  // Test 3: Round-trip with complex structure
  results.push(await testRoundTripComplex());

  return results;
}

/**
 * Test 1: Round-trip with restrictions
 */
async function testRoundTripWithRestrictions(): Promise<ComparisonResult> {
  const fixturePath = join(FIXTURES_DIR, 'multiple-restrictions.ttl');
  const original = readFileSync(fixturePath, 'utf-8');

  // Parse with N3
  const parseResult1 = await parseRdfToGraph(original, { path: fixturePath });
  const { store: store1 } = parseResult1;

  // Convert to rdflib and serialize
  const quads1 = Array.from(store1);
  const statements = convertN3QuadsToRdflibStatements(quads1);
  const serialized = await serializeWithRdflib(statements, 'text/turtle', {
    prefixes: extractPrefixes(original)
  });

  // Re-parse the serialized output
  const parseResult2 = await parseRdfToGraph(serialized, { path: 'serialized.ttl' });
  const { store: store2 } = parseResult2;

  // Compare quads
  const quads2 = Array.from(store2);
  
  // Check if all original quads are present in re-parsed store
  const missingQuads: string[] = [];
  for (const quad1 of quads1) {
    const found = quads2.some(quad2 => quadsEqual(quad1, quad2));
    if (!found) {
      const quadStr = `${quad1.subject.value} ${quad1.predicate.value} ${quad1.object.value || (quad1.object as { id: string }).id}`;
      missingQuads.push(quadStr);
    }
  }

  const passed = missingQuads.length === 0;

  return {
    scenario: 'roundTrip',
    testCase: 'Round-trip with restrictions',
    passed,
    issues: passed ? [] : [`Missing ${missingQuads.length} quad(s) after round-trip`],
    warnings: [],
    original,
    serialized,
    requirements: [{
      name: 'round-trip',
      passed,
      message: passed ? 'All quads preserved after round-trip' : `Missing ${missingQuads.length} quad(s)`,
      details: missingQuads.length > 0 ? `Missing quads: ${missingQuads.slice(0, 5).join(', ')}${missingQuads.length > 5 ? '...' : ''}` : undefined
    }]
  };
}

/**
 * Test 2: Round-trip with annotations
 */
async function testRoundTripWithAnnotations(): Promise<ComparisonResult> {
  const fixturePath = join(FIXTURES_DIR, 'with-annotations.ttl');
  const original = readFileSync(fixturePath, 'utf-8');

  // Parse with N3
  const parseResult1 = await parseRdfToGraph(original, { path: fixturePath });
  const { store: store1 } = parseResult1;

  // Convert to rdflib and serialize
  const quads1 = Array.from(store1);
  const statements = convertN3QuadsToRdflibStatements(quads1);
  const serialized = await serializeWithRdflib(statements, 'text/turtle', {
    prefixes: extractPrefixes(original)
  });

  // Re-parse the serialized output
  const parseResult2 = await parseRdfToGraph(serialized, { path: 'serialized.ttl' });
  const { store: store2 } = parseResult2;

  // Compare quads
  const quads2 = Array.from(store2);
  
  // Check if all original quads are present
  const missingQuads: string[] = [];
  for (const quad1 of quads1) {
    const found = quads2.some(quad2 => quadsEqual(quad1, quad2));
    if (!found) {
      const quadStr = `${quad1.subject.value} ${quad1.predicate.value} ${quad1.object.value || (quad1.object as { id: string }).id}`;
      missingQuads.push(quadStr);
    }
  }

  const passed = missingQuads.length === 0;

  return {
    scenario: 'roundTrip',
    testCase: 'Round-trip with annotations',
    passed,
    issues: passed ? [] : [`Missing ${missingQuads.length} quad(s) after round-trip`],
    warnings: [],
    original,
    serialized,
    requirements: [{
      name: 'round-trip',
      passed,
      message: passed ? 'All quads preserved after round-trip' : `Missing ${missingQuads.length} quad(s)`,
      details: missingQuads.length > 0 ? `Missing quads: ${missingQuads.slice(0, 5).join(', ')}${missingQuads.length > 5 ? '...' : ''}` : undefined
    }]
  };
}

/**
 * Test 3: Round-trip with complex structure
 */
async function testRoundTripComplex(): Promise<ComparisonResult> {
  const fixturePath = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');
  const original = readFileSync(fixturePath, 'utf-8');

  // Parse with N3
  const parseResult1 = await parseRdfToGraph(original, { path: fixturePath });
  const { store: store1 } = parseResult1;

  // Convert to rdflib and serialize
  const quads1 = Array.from(store1);
  const statements = convertN3QuadsToRdflibStatements(quads1);
  const serialized = await serializeWithRdflib(statements, 'text/turtle', {
    prefixes: extractPrefixes(original)
  });

  // Re-parse the serialized output
  const parseResult2 = await parseRdfToGraph(serialized, { path: 'serialized.ttl' });
  const { store: store2 } = parseResult2;

  // Compare quads
  const quads2 = Array.from(store2);
  
  // Check if all original quads are present
  const missingQuads: string[] = [];
  for (const quad1 of quads1) {
    const found = quads2.some(quad2 => quadsEqual(quad1, quad2));
    if (!found) {
      const quadStr = `${quad1.subject.value} ${quad1.predicate.value} ${quad1.object.value || (quad1.object as { id: string }).id}`;
      missingQuads.push(quadStr);
    }
  }

  const passed = missingQuads.length === 0;

  return {
    scenario: 'roundTrip',
    testCase: 'Round-trip with complex structure (aec_drawing_metadata.ttl)',
    passed,
    issues: passed ? [] : [`Missing ${missingQuads.length} quad(s) after round-trip`],
    warnings: [],
    original,
    serialized,
    requirements: [{
      name: 'round-trip',
      passed,
      message: passed ? 'All quads preserved after round-trip' : `Missing ${missingQuads.length} quad(s)`,
      details: missingQuads.length > 0 ? `Missing quads: ${missingQuads.slice(0, 5).join(', ')}${missingQuads.length > 5 ? '...' : ''}` : undefined
    }]
  };
}

/**
 * Check if two quads are equal (semantically)
 */
function quadsEqual(quad1: any, quad2: any): boolean {
  // Compare subjects
  if (quad1.subject.termType !== quad2.subject.termType) return false;
  if (quad1.subject.termType === 'NamedNode') {
    if (quad1.subject.value !== quad2.subject.value) return false;
  } else if (quad1.subject.termType === 'BlankNode') {
    // Blank nodes might have different IDs, so we can't compare by ID
    // For now, we'll just check that both are blank nodes
    // A more sophisticated check would compare by structure
  }

  // Compare predicates
  if (quad1.predicate.value !== quad2.predicate.value) return false;

  // Compare objects
  if (quad1.object.termType !== quad2.object.termType) return false;
  if (quad1.object.termType === 'NamedNode') {
    if (quad1.object.value !== quad2.object.value) return false;
  } else if (quad1.object.termType === 'Literal') {
    const lit1 = quad1.object as { value: string; datatype?: { value: string }; language?: string };
    const lit2 = quad2.object as { value: string; datatype?: { value: string }; language?: string };
    if (lit1.value !== lit2.value) return false;
    if (lit1.language !== lit2.language) return false;
    if (lit1.datatype?.value !== lit2.datatype?.value) return false;
  } else if (quad1.object.termType === 'BlankNode') {
    // Blank nodes might have different IDs, so we can't compare by ID
    // For now, we'll just check that both are blank nodes
  }

  return true;
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
