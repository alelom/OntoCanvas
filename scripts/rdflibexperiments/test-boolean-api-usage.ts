/**
 * Test different ways of creating boolean literals with rdflib
 * to verify if we're using the API correctly
 */
import { NamedNode, Literal, Store, serialize, Statement } from 'rdflib';

async function test() {
  console.log('=== Testing Different Boolean Literal Construction Methods ===\n');
  
  const XSD_BOOLEAN = new NamedNode('http://www.w3.org/2001/XMLSchema#boolean');
  const store = new Store();
  const predicate = new NamedNode('http://example.org/test#hasBoolean');
  
  // Test different construction methods
  const tests = [
    {
      name: 'String "true" with empty language',
      literal: new Literal('true', '', XSD_BOOLEAN),
      expected: 'true'
    },
    {
      name: 'String "false" with empty language',
      literal: new Literal('false', '', XSD_BOOLEAN),
      expected: 'false'
    },
    {
      name: 'String "true" without language parameter',
      literal: new Literal('true', undefined as any, XSD_BOOLEAN),
      expected: 'true'
    },
    {
      name: 'String "1" (valid boolean lexical form)',
      literal: new Literal('1', '', XSD_BOOLEAN),
      expected: 'true'
    },
    {
      name: 'String "0" (valid boolean lexical form)',
      literal: new Literal('0', '', XSD_BOOLEAN),
      expected: 'false'
    },
  ];
  
  console.log('Creating literals and inspecting properties:\n');
  tests.forEach((test, idx) => {
    const subject = new NamedNode(`http://example.org/test#Test${idx + 1}`);
    store.add(new Statement(subject, predicate, test.literal));
    
    console.log(`${idx + 1}. ${test.name}:`);
    console.log(`   .value: ${test.literal.value} (type: ${typeof test.literal.value})`);
    console.log(`   .datatype: ${test.literal.datatype?.value}`);
    console.log(`   .language: ${test.literal.language || '(empty/undefined)'}`);
    console.log(`   .value === "true": ${test.literal.value === 'true'}`);
    console.log(`   .value === "false": ${test.literal.value === 'false'}`);
    console.log(`   .value === true: ${test.literal.value === true}`);
    console.log(`   .value === false: ${test.literal.value === false}`);
    console.log();
  });
  
  console.log('=== Serializing to Turtle ===\n');
  serialize(null, store, null, 'text/turtle', (err: Error | null, result?: string) => {
    if (err) {
      console.error('Error:', err);
      return;
    }
    
    console.log('Serialized output:');
    console.log(result);
    console.log();
    
    // Analyze each test
    console.log('=== Analysis ===\n');
    tests.forEach((test, idx) => {
      const pattern = new RegExp(`Test${idx + 1}[^\\n]*hasBoolean\\s+([^\\s.]+)`);
      const match = result?.match(pattern);
      const serializedValue = match ? match[1] : 'NOT FOUND';
      
      let status = '✅';
      if (test.expected === 'true' && serializedValue === 'false') {
        status = '❌ BUG';
      } else if (test.expected === 'false' && serializedValue === 'false') {
        status = '✅ OK';
      } else if (serializedValue === 'true') {
        status = '✅ OK';
      } else {
        status = '⚠️  UNEXPECTED';
      }
      
      console.log(`${idx + 1}. ${test.name}:`);
      console.log(`   Expected: ${test.expected}`);
      console.log(`   Serialized: ${serializedValue}`);
      console.log(`   Status: ${status}`);
      console.log();
    });
  });
}

test().catch(console.error);
