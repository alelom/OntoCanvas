/**
 * Test multi-format serialization (Turtle, RDF/XML, JSON-LD)
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../../src/parser.js';
import { convertN3QuadsToRdflibStatements } from '../utils/n3ToRdflib.js';
import { serializeWithRdflib, type SerializationFormat } from '../utils/rdflibSerializer.js';
import { compareOutputs, type ComparisonResult } from '../utils/comparison.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_DIR = join(__dirname, '../fixtures');
const TEST_FIXTURES_DIR = join(__dirname, '../../../tests/fixtures');

/**
 * Run multi-format serialization tests
 */
export async function runMultiFormatTests(): Promise<ComparisonResult[]> {
  const results: ComparisonResult[] = [];

  // Test 1: Serialize to Turtle
  results.push(await testTurtleSerialization());

  // Test 2: Serialize to RDF/XML
  results.push(await testRdfXmlSerialization());

  // Test 3: Serialize to JSON-LD
  results.push(await testJsonLdSerialization());

  return results;
}

/**
 * Test 1: Serialize to Turtle
 */
async function testTurtleSerialization(): Promise<ComparisonResult> {
  const fixturePath = join(FIXTURES_DIR, 'simple-restriction.ttl');
  const original = readFileSync(fixturePath, 'utf-8');

  // Parse with N3
  const parseResult = await parseRdfToGraph(original, { path: fixturePath });
  const { store } = parseResult;

  // Convert to rdflib
  const quads = Array.from(store);
  const statements = convertN3QuadsToRdflibStatements(quads);

  // Serialize with rdflib to Turtle
  const serialized = await serializeWithRdflib(statements, 'text/turtle', {
    prefixes: extractPrefixes(original)
  });

  // Compare (check blank nodes work in Turtle)
  return compareOutputs(
    original,
    serialized,
    ['blank-node-definitions', 'blank-node-inline-forms'],
    'multiFormat',
    'Serialize to Turtle'
  );
}

/**
 * Test 2: Serialize to RDF/XML
 */
async function testRdfXmlSerialization(): Promise<ComparisonResult> {
  const fixturePath = join(FIXTURES_DIR, 'simple-restriction.ttl');
  const original = readFileSync(fixturePath, 'utf-8');

  // Parse with N3
  const parseResult = await parseRdfToGraph(original, { path: fixturePath });
  const { store } = parseResult;

  // Convert to rdflib
  const quads = Array.from(store);
  const statements = convertN3QuadsToRdflibStatements(quads);

  try {
    // Serialize with rdflib to RDF/XML
    const serialized = await serializeWithRdflib(statements, 'application/rdf+xml', {
      prefixes: extractPrefixes(original)
    });

    // Check if serialization succeeded and contains RDF/XML structure
    const hasRdfXml = serialized.includes('<?xml') && serialized.includes('<rdf:RDF');
    const hasRestrictions = serialized.includes('owl:Restriction') || serialized.includes('Restriction');

    return {
      scenario: 'multiFormat',
      testCase: 'Serialize to RDF/XML',
      passed: hasRdfXml && hasRestrictions,
      issues: hasRdfXml && hasRestrictions ? [] : [
        hasRdfXml ? 'Restrictions not found in RDF/XML' : 'Invalid RDF/XML format'
      ],
      warnings: [],
      original,
      serialized,
      requirements: [{
        name: 'rdf-xml-format',
        passed: hasRdfXml,
        message: hasRdfXml ? 'Valid RDF/XML format' : 'Invalid RDF/XML format'
      }, {
        name: 'rdf-xml-restrictions',
        passed: hasRestrictions,
        message: hasRestrictions ? 'Restrictions found in RDF/XML' : 'Restrictions not found in RDF/XML'
      }]
    };
  } catch (error) {
    return {
      scenario: 'multiFormat',
      testCase: 'Serialize to RDF/XML',
      passed: false,
      issues: [`Failed to serialize to RDF/XML: ${error instanceof Error ? error.message : String(error)}`],
      warnings: [],
      original,
      serialized: '',
      requirements: [{
        name: 'rdf-xml-format',
        passed: false,
        message: 'Serialization failed'
      }]
    };
  }
}

/**
 * Test 3: Serialize to JSON-LD
 */
async function testJsonLdSerialization(): Promise<ComparisonResult> {
  const fixturePath = join(FIXTURES_DIR, 'simple-restriction.ttl');
  const original = readFileSync(fixturePath, 'utf-8');

  // Parse with N3
  const parseResult = await parseRdfToGraph(original, { path: fixturePath });
  const { store } = parseResult;

  // Convert to rdflib
  const quads = Array.from(store);
  const statements = convertN3QuadsToRdflibStatements(quads);

  try {
    // Serialize with rdflib to JSON-LD
    const serialized = await serializeWithRdflib(statements, 'application/ld+json', {
      prefixes: extractPrefixes(original)
    });

    // Check if serialization succeeded and contains JSON-LD structure
    let parsedJson;
    try {
      parsedJson = JSON.parse(serialized);
    } catch {
      return {
        scenario: 'multiFormat',
        testCase: 'Serialize to JSON-LD',
        passed: false,
        issues: ['Invalid JSON-LD format (not valid JSON)'],
        warnings: [],
        original,
        serialized,
        requirements: [{
          name: 'json-ld-format',
          passed: false,
          message: 'Invalid JSON-LD format'
        }]
      };
    }

    const isArray = Array.isArray(parsedJson);
    const hasContext = !isArray && parsedJson['@context'];
    const hasGraph = isArray || parsedJson['@graph'];

    return {
      scenario: 'multiFormat',
      testCase: 'Serialize to JSON-LD',
      passed: isArray || hasContext || hasGraph,
      issues: (isArray || hasContext || hasGraph) ? [] : ['Invalid JSON-LD structure'],
      warnings: [],
      original,
      serialized,
      requirements: [{
        name: 'json-ld-format',
        passed: isArray || hasContext || hasGraph,
        message: (isArray || hasContext || hasGraph) ? 'Valid JSON-LD format' : 'Invalid JSON-LD structure'
      }]
    };
  } catch (error) {
    return {
      scenario: 'multiFormat',
      testCase: 'Serialize to JSON-LD',
      passed: false,
      issues: [`Failed to serialize to JSON-LD: ${error instanceof Error ? error.message : String(error)}`],
      warnings: [],
      original,
      serialized: '',
      requirements: [{
        name: 'json-ld-format',
        passed: false,
        message: 'Serialization failed'
      }]
    };
  }
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
