/**
 * Test how rdflib constructs boolean literals
 */
import { NamedNode, Literal } from 'rdflib';

console.log('=== Testing rdflib Literal Construction ===\n');

const XSD_BOOLEAN = new NamedNode('http://www.w3.org/2001/XMLSchema#boolean');

// Test 1: String "true"
console.log('Test 1: new Literal("true", "", xsd:boolean)');
const lit1 = new Literal('true', '', XSD_BOOLEAN);
console.log('  .value:', lit1.value);
console.log('  .value type:', typeof lit1.value);
console.log('  .datatype:', lit1.datatype?.value);
console.log('  .language:', lit1.language || '(empty)');

// Test 2: String "false"
console.log('\nTest 2: new Literal("false", "", xsd:boolean)');
const lit2 = new Literal('false', '', XSD_BOOLEAN);
console.log('  .value:', lit2.value);
console.log('  .value type:', typeof lit2.value);
console.log('  .datatype:', lit2.datatype?.value);

// Test 3: Boolean true (if constructor accepts it)
console.log('\nTest 3: new Literal(true, "", xsd:boolean)');
try {
  const lit3 = new Literal(true as any, '', XSD_BOOLEAN);
  console.log('  .value:', lit3.value);
  console.log('  .value type:', typeof lit3.value);
  console.log('  .datatype:', lit3.datatype?.value);
} catch (e) {
  console.log('  Error:', (e as Error).message);
}

// Test 4: Boolean false
console.log('\nTest 4: new Literal(false, "", xsd:boolean)');
try {
  const lit4 = new Literal(false as any, '', XSD_BOOLEAN);
  console.log('  .value:', lit4.value);
  console.log('  .value type:', typeof lit4.value);
  console.log('  .datatype:', lit4.datatype?.value);
} catch (e) {
  console.log('  Error:', (e as Error).message);
}

// Test 5: Check if rdflib normalizes "true" to boolean true
console.log('\nTest 5: Checking normalization');
console.log('  lit1.value === true:', lit1.value === true);
console.log('  lit1.value === "true":', lit1.value === 'true');
console.log('  lit1.value === false:', lit1.value === false);
console.log('  lit1.value === "false":', lit1.value === 'false');

console.log('  lit2.value === true:', lit2.value === true);
console.log('  lit2.value === "true":', lit2.value === 'true');
console.log('  lit2.value === false:', lit2.value === false);
console.log('  lit2.value === "false":', lit2.value === 'false');
