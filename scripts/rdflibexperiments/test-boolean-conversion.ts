/**
 * Test boolean literal conversion and serialization
 */
import { NamedNode, Literal, Store, serialize, Statement } from 'rdflib';

async function test() {
  console.log('=== Testing Boolean Literal Conversion ===\n');
  
  // Test 1: Create literal with "true" value and xsd:boolean datatype
  console.log('Test 1: Creating literal with "true" and xsd:boolean');
  const lit1 = new Literal('true', '', new NamedNode('http://www.w3.org/2001/XMLSchema#boolean'));
  console.log('Literal value:', lit1.value);
  console.log('Literal datatype:', lit1.datatype?.value);
  console.log('Literal language:', lit1.language || '(empty)');
  
  // Test 2: Create literal with "false" value and xsd:boolean datatype
  console.log('\nTest 2: Creating literal with "false" and xsd:boolean');
  const lit2 = new Literal('false', '', new NamedNode('http://www.w3.org/2001/XMLSchema#boolean'));
  console.log('Literal value:', lit2.value);
  console.log('Literal datatype:', lit2.datatype?.value);
  
  // Test 3: Serialize both
  console.log('\nTest 3: Serializing both literals');
  const store = new Store();
  const subj1 = new NamedNode('http://example.org/test#Test1');
  const subj2 = new NamedNode('http://example.org/test#Test2');
  const pred = new NamedNode('http://example.org/test#labellableRoot');
  
  store.add(new Statement(subj1, pred, lit1));
  store.add(new Statement(subj2, pred, lit2));
  
  serialize(null, store, null, 'text/turtle', (err: Error | null, result?: string) => {
    if (err) {
      console.error('Error:', err);
      return;
    }
    console.log('Serialized output:');
    console.log(result);
    
    // Check what was serialized
    const trueMatch = result?.match(/labellableRoot\s+([^\s.]+)/g);
    console.log('\nFound labellableRoot values:', trueMatch);
  });
}

test().catch(console.error);
