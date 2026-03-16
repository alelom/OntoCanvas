/**
 * Test round-trip boolean literal handling
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
  
  console.log('\n=== PARSING (N3) ===');
  const parseResult1 = await parseRdfToGraph(original, { path: fixturePath });
  const { store: store1 } = parseResult1;
  
  console.log('Total quads:', store1.size);
  
  // Find labellableRoot quads
  const labellableQuads = Array.from(store1).filter(q => {
    const pred = (q.predicate as { value: string }).value;
    return pred.includes('labellableRoot');
  });
  
  console.log(`\nFound ${labellableQuads.length} labellableRoot quads:`);
  labellableQuads.forEach(q => {
    const subj = (q.subject as { value: string }).value;
    const obj = q.object;
    const objValue = (obj as { value: string }).value;
    const objDatatype = (obj as { datatype?: { value: string } }).datatype?.value;
    const objTermType = (obj as { termType: string }).termType;
    console.log(`  ${subj} labellableRoot ${objValue} (type: ${objTermType}, datatype: ${objDatatype || 'none'})`);
  });
  
  console.log('\n=== CONVERTING TO RDFLIB ===');
  const quads1 = Array.from(store1);
  const statements = convertN3QuadsToRdflibStatements(quads1);
  
  // Check rdflib statements
  const rdflibLabellable = statements.filter(s => {
    const pred = s.predicate.value;
    return pred.includes('labellableRoot');
  });
  
  console.log(`Found ${rdflibLabellable.length} labellableRoot statements in rdflib:`);
  rdflibLabellable.forEach(s => {
    const obj = s.object;
    const objValue = (obj as { value: string }).value;
    const objDatatype = (obj as { datatype?: { value: string } }).datatype?.value;
    const objLanguage = (obj as { language?: string }).language;
    console.log(`  ${s.subject.value} labellableRoot ${objValue} (datatype: ${objDatatype || 'none'}, language: ${objLanguage || 'none'})`);
  });
  
  console.log('\n=== SERIALIZING WITH RDFLIB ===');
  const serialized = await serializeWithRdflib(statements, 'text/turtle', {
    prefixes: { '': 'http://example.org/test#', 'owl': 'http://www.w3.org/2002/07/owl#', 'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'rdfs': 'http://www.w3.org/2000/01/rdf-schema#', 'xsd': 'http://www.w3.org/2001/XMLSchema#' }
  });
  
  console.log(serialized);
  
  // Check serialized output for labellableRoot
  const serializedLabellable = serialized.match(/labellableRoot\s+[^\s.]+/g);
  console.log(`\n=== SERIALIZED OUTPUT ===`);
  console.log(`Found ${serializedLabellable?.length || 0} labellableRoot statements in serialized output:`);
  serializedLabellable?.forEach(m => console.log(`  ${m}`));
  
  console.log('\n=== RE-PARSING (N3) ===');
  const parseResult2 = await parseRdfToGraph(serialized, { path: 'serialized.ttl' });
  const { store: store2 } = parseResult2;
  
  console.log('Total quads after re-parse:', store2.size);
  
  // Find labellableRoot quads after re-parse
  const labellableQuads2 = Array.from(store2).filter(q => {
    const pred = (q.predicate as { value: string }).value;
    return pred.includes('labellableRoot');
  });
  
  console.log(`\nFound ${labellableQuads2.length} labellableRoot quads after re-parse:`);
  labellableQuads2.forEach(q => {
    const subj = (q.subject as { value: string }).value;
    const obj = q.object;
    const objValue = (obj as { value: string }).value;
    const objDatatype = (obj as { datatype?: { value: string } }).datatype?.value;
    const objTermType = (obj as { termType: string }).termType;
    console.log(`  ${subj} labellableRoot ${objValue} (type: ${objTermType}, datatype: ${objDatatype || 'none'})`);
  });
  
  console.log('\n=== COMPARISON ===');
  console.log(`Original: ${labellableQuads.length} labellableRoot quads`);
  console.log(`After round-trip: ${labellableQuads2.length} labellableRoot quads`);
  console.log(`Lost: ${labellableQuads.length - labellableQuads2.length}`);
  
  // Find which ones are missing
  const missing: string[] = [];
  for (const q1 of labellableQuads) {
    const subj1 = (q1.subject as { value: string }).value;
    const obj1Value = (q1.object as { value: string }).value;
    const found = labellableQuads2.some(q2 => {
      const subj2 = (q2.subject as { value: string }).value;
      const obj2Value = (q2.object as { value: string }).value;
      return subj1 === subj2 && obj1Value === obj2Value;
    });
    if (!found) {
      missing.push(`${subj1} labellableRoot ${obj1Value}`);
    }
  }
  
  if (missing.length > 0) {
    console.log(`\nMissing quads:`);
    missing.forEach(m => console.log(`  ${m}`));
  }
}

test().catch(console.error);
