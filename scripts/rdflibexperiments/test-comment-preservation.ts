/**
 * Test comment preservation approaches with rdflib
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/parser.js';
import { convertN3QuadsToRdflibStatements } from './utils/n3ToRdflib.js';
import { serializeWithRdflib } from './utils/rdflibSerializer.js';
import { extractComments, reinsertComments } from './utils/commentPreservation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function test() {
  const fixturePath = join(__dirname, 'fixtures/with-comments.ttl');
  const original = readFileSync(fixturePath, 'utf-8');
  
  console.log('=== ORIGINAL (with comments) ===');
  console.log(original);
  console.log('\n=== EXTRACTING COMMENTS ===');
  
  const comments = extractComments(original);
  console.log(`Found ${comments.length} comments:`);
  comments.forEach(c => {
    console.log(`  Line ${c.line}: [${c.type}] ${c.text.substring(0, 50)}`);
  });
  
  console.log('\n=== PARSING AND SERIALIZING ===');
  const parseResult = await parseRdfToGraph(original, { path: fixturePath });
  const { store } = parseResult;
  
  const quads = Array.from(store);
  const statements = convertN3QuadsToRdflibStatements(quads);
  
  const serialized = await serializeWithRdflib(statements, 'text/turtle', {
    prefixes: { '': 'http://example.org/test#', 'owl': 'http://www.w3.org/2002/07/owl#', 'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'rdfs': 'http://www.w3.org/2000/01/rdf-schema#' }
  });
  
  console.log('Serialized (no comments):');
  console.log(serialized);
  
  console.log('\n=== ATTEMPTING TO RE-INSERT COMMENTS ===');
  const withComments = reinsertComments(serialized, comments, original);
  
  console.log('With comments (post-processed):');
  console.log(withComments);
  
  console.log('\n=== ANALYSIS ===');
  const originalCommentCount = (original.match(/^#.*$/gm) || []).length;
  const processedCommentCount = (withComments.match(/^#.*$/gm) || []).length;
  console.log(`Original comments: ${originalCommentCount}`);
  console.log(`Processed comments: ${processedCommentCount}`);
  console.log(`Preserved: ${processedCommentCount}/${originalCommentCount} (${((processedCommentCount/originalCommentCount)*100).toFixed(1)}%)`);
}

test().catch(console.error);
