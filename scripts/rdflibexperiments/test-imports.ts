/**
 * Test imports preservation with rdflib
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
  const fixturePath = join(__dirname, 'fixtures/with-imports.ttl');
  const original = readFileSync(fixturePath, 'utf-8');
  
  console.log('=== ORIGINAL ===');
  console.log(original);
  
  console.log('\n=== PARSING ===');
  const parseResult = await parseRdfToGraph(original, { path: fixturePath });
  const { store } = parseResult;
  
  console.log('Total quads:', store.size);
  
  // Check for owl:imports quads
  const OWL = 'http://www.w3.org/2002/07/owl#';
  const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  
  const importQuads = Array.from(store).filter(q => {
    const pred = (q.predicate as { value: string }).value;
    return pred === `${OWL}imports`;
  });
  
  console.log(`\nFound ${importQuads.length} owl:imports quads:`);
  importQuads.forEach(q => {
    const subj = (q.subject as { value: string }).value;
    const obj = (q.object as { value: string }).value;
    console.log(`  ${subj} owl:imports ${obj}`);
  });
  
  // Check for ontology declaration
  const ontologyQuads = Array.from(store).filter(q => {
    const pred = (q.predicate as { value: string }).value;
    const obj = (q.object as { value: string }).value;
    return pred === `${RDF}type` && obj === `${OWL}Ontology`;
  });
  
  console.log(`\nFound ${ontologyQuads.length} owl:Ontology declarations:`);
  ontologyQuads.forEach(q => {
    const subj = (q.subject as { value: string }).value;
    console.log(`  ${subj} a owl:Ontology`);
  });
  
  console.log('\n=== CONVERTING TO RDFLIB ===');
  const quads = Array.from(store);
  const statements = convertN3QuadsToRdflibStatements(quads);
  
  console.log('Total statements:', statements.length);
  
  // Check rdflib statements for imports
  const rdflibImports = statements.filter(s => {
    const pred = s.predicate.value;
    return pred === `${OWL}imports`;
  });
  
  console.log(`Found ${rdflibImports.length} owl:imports statements in rdflib:`);
  rdflibImports.forEach(s => {
    console.log(`  ${s.subject.value} owl:imports ${s.object.value}`);
  });
  
  console.log('\n=== SERIALIZING WITH RDFLIB ===');
  const serialized = await serializeWithRdflib(statements, 'text/turtle', {
    prefixes: { '': 'http://example.org/test#', 'owl': OWL, 'rdf': RDF, 'rdfs': 'http://www.w3.org/2000/01/rdf-schema#' }
  });
  
  console.log(serialized);
  
  console.log('\n=== CHECKING SERIALIZED OUTPUT ===');
  
  // Check for imports in various formats
  const fullUriImports = (serialized.match(/owl:imports\s+<\S+>/g) || []).length;
  const prefixImports = (serialized.match(/owl:imports\s+[^.\s<>]+/g) || []);
  
  // Count comma-separated imports
  const importLine = serialized.match(/owl:imports\s+[^.]+/g);
  let commaSeparatedCount = 0;
  if (importLine && importLine.length > 0) {
    // Count commas + 1 (e.g., "exa:import1, exa:import2, exa:import3" = 3 imports)
    const commaCount = (importLine[0].match(/,/g) || []).length;
    commaSeparatedCount = commaCount + 1;
  }
  
  const totalSerializedImports = Math.max(fullUriImports, commaSeparatedCount);
  
  console.log(`Found ${fullUriImports} owl:imports with full URI format`);
  console.log(`Found ${commaSeparatedCount} owl:imports in comma-separated format`);
  console.log(`Total: ${totalSerializedImports} imports in serialized output`);
  
  if (totalSerializedImports === 0 && importQuads.length > 0) {
    console.log('\n❌ ISSUE: Imports are in quads but not in serialized output!');
    console.log('This suggests rdflib may not serialize owl:imports statements.');
  } else if (totalSerializedImports === importQuads.length) {
    console.log('\n✅ Imports are preserved!');
    if (fullUriImports === 0 && commaSeparatedCount > 0) {
      console.log('   (Note: rdflib uses prefix notation instead of full URIs)');
    }
  } else {
    console.log(`\n⚠️  Partial preservation: ${totalSerializedImports}/${importQuads.length}`);
  }
}

test().catch(console.error);
