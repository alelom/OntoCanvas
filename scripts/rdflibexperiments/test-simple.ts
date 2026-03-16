/**
 * Simple test to see what rdflib actually outputs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/parser.js';
import { convertN3QuadsToRdflibStatements } from './utils/n3ToRdflib.js';
import { serializeWithRdflib } from './utils/rdflibSerializer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function test() {
  const fixturePath = join(__dirname, 'fixtures/with-annotations.ttl');
  const original = readFileSync(fixturePath, 'utf-8');
  
  console.log('=== ORIGINAL ===');
  console.log(original);
  console.log('\n=== PARSING ===');
  
  const parseResult = await parseRdfToGraph(original, { path: fixturePath });
  const { store } = parseResult;
  
  console.log('Quads:', store.size);
  
  const quads = Array.from(store);
  const statements = convertN3QuadsToRdflibStatements(quads);
  
  console.log('Statements:', statements.length);
  
  console.log('\n=== SERIALIZING WITH RDFLIB ===');
  const serialized = await serializeWithRdflib(statements, 'text/turtle', {
    prefixes: { '': 'http://example.org/test#', 'owl': 'http://www.w3.org/2002/07/owl#', 'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'rdfs': 'http://www.w3.org/2000/01/rdf-schema#', 'xsd': 'http://www.w3.org/2001/XMLSchema#' }
  });
  
  console.log(serialized);
  console.log('\n=== TRYING TO RE-PARSE ===');
  
  try {
    const parseResult2 = await parseRdfToGraph(serialized, { path: 'serialized.ttl' });
    console.log('✅ Re-parsing succeeded!');
    console.log('Quads:', parseResult2.store.size);
  } catch (error) {
    console.log('❌ Re-parsing failed:', error instanceof Error ? error.message : String(error));
  }
}

test().catch(console.error);
