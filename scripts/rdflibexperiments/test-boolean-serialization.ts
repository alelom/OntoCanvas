/**
 * Test serialization with different boolean literal constructions
 */
import { NamedNode, Literal, Store, serialize, Statement } from 'rdflib';

async function test() {
  console.log('=== Testing Boolean Serialization Variations ===\n');
  
  const store = new Store();
  const subject = new NamedNode('http://example.org/test#Test');
  const predicate = new NamedNode('http://example.org/test#hasBoolean');
  const XSD_BOOLEAN = new NamedNode('http://www.w3.org/2001/XMLSchema#boolean');
  
  // Test different ways to create boolean literals
  const tests = [
    { name: 'String "true"', literal: new Literal('true', '', XSD_BOOLEAN) },
    { name: 'String "false"', literal: new Literal('false', '', XSD_BOOLEAN) },
    { name: 'Boolean true', literal: new Literal(true as any, '', XSD_BOOLEAN) },
    { name: 'Boolean false', literal: new Literal(false as any, '', XSD_BOOLEAN) },
    { name: 'String "1"', literal: new Literal('1', '', XSD_BOOLEAN) },
    { name: 'String "0"', literal: new Literal('0', '', XSD_BOOLEAN) },
  ];
  
  console.log('Creating literals:');
  tests.forEach((test, idx) => {
    console.log(`\n${idx + 1}. ${test.name}:`);
    console.log(`   Value: ${test.literal.value} (type: ${typeof test.literal.value})`);
    console.log(`   Datatype: ${test.literal.datatype?.value}`);
    const subj = new NamedNode(`http://example.org/test#Test${idx + 1}`);
    store.add(new Statement(subj, predicate, test.literal));
  });
  
  console.log('\n=== Serializing to Turtle ===');
  serialize(null, store, null, 'text/turtle', (err: Error | null, result?: string) => {
    if (err) {
      console.error('Error:', err);
      return;
    }
    
    console.log('Serialized output:');
    console.log(result);
    
    // Extract each test result
    console.log('\n=== Analysis ===');
    tests.forEach((test, idx) => {
      const pattern = new RegExp(`Test${idx + 1}[^\\n]*hasBoolean\\s+([^\\s.]+)`);
      const match = result?.match(pattern);
      const serializedValue = match ? match[1] : 'NOT FOUND';
      const originalValue = test.literal.value;
      const matchStatus = (originalValue === 'true' || originalValue === true) && serializedValue === 'false' ? '❌ BUG' :
                         (originalValue === 'false' || originalValue === false) && serializedValue === 'false' ? '✅ OK' :
                         serializedValue === 'true' ? '✅ OK' : '⚠️  UNEXPECTED';
      
      console.log(`${idx + 1}. ${test.name}:`);
      console.log(`   Original: ${originalValue} (${typeof originalValue})`);
      console.log(`   Serialized: ${serializedValue}`);
      console.log(`   Status: ${matchStatus}`);
    });
  });
}

test().catch(console.error);
