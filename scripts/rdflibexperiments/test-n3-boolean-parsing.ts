/**
 * Test what N3 parser provides for boolean literals
 */
import { Parser, DataFactory } from 'n3';

const content = `@prefix : <http://example.org/test#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Test1 :hasBoolean "true"^^xsd:boolean .
:Test2 :hasBoolean "false"^^xsd:boolean .
:Test3 :hasBoolean true .
:Test4 :hasBoolean false .
`;

console.log('=== Testing N3 Parser with Boolean Literals ===\n');
console.log('Input:');
console.log(content);

const parser = new Parser();
const quads: any[] = [];

try {
  const parsed = parser.parse(content);
  const quadArray = Array.isArray(parsed) ? parsed : [...parsed];
  quads.push(...quadArray);
} catch (error) {
  console.error('Parse error:', error);
}

console.log(`\nParsed ${quads.length} quads:\n`);

quads.forEach((quad, idx) => {
  const subj = (quad.subject as { value: string }).value;
  const obj = quad.object;
  const objValue = (obj as { value: string }).value;
  const objDatatype = (obj as { datatype?: { value: string } }).datatype?.value;
  const objTermType = (obj as { termType: string }).termType;
  const objType = typeof objValue;
  
  console.log(`Quad ${idx + 1}: ${subj} hasBoolean ${objValue}`);
  console.log(`  Object termType: ${objTermType}`);
  console.log(`  Object value: ${objValue} (type: ${objType})`);
  console.log(`  Object datatype: ${objDatatype || 'none'}`);
  console.log();
});
