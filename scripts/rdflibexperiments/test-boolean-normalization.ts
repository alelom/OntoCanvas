/**
 * Test if we should normalize "true"/"false" to "1"/"0" before creating Literal
 */
import { NamedNode, Literal, Store, serialize, Statement } from 'rdflib';

async function test() {
  console.log('=== Testing Boolean Normalization Workaround ===\n');
  
  const XSD_BOOLEAN = new NamedNode('http://www.w3.org/2001/XMLSchema#boolean');
  const store = new Store();
  const predicate = new NamedNode('http://example.org/test#hasBoolean');
  
  // Test: Normalize "true" to "1" and "false" to "0"
  function normalizeBooleanValue(value: string): string {
    if (value === 'true') return '1';
    if (value === 'false') return '0';
    return value;
  }
  
  const tests = [
    {
      name: 'Original: "true" (normalized to "1")',
      original: 'true',
      normalized: normalizeBooleanValue('true'),
      literal: new Literal(normalizeBooleanValue('true'), '', XSD_BOOLEAN)
    },
    {
      name: 'Original: "false" (normalized to "0")',
      original: 'false',
      normalized: normalizeBooleanValue('false'),
      literal: new Literal(normalizeBooleanValue('false'), '', XSD_BOOLEAN)
    },
    {
      name: 'Direct: "1"',
      original: '1',
      normalized: '1',
      literal: new Literal('1', '', XSD_BOOLEAN)
    },
    {
      name: 'Direct: "0"',
      original: '0',
      normalized: '0',
      literal: new Literal('0', '', XSD_BOOLEAN)
    },
  ];
  
  console.log('Creating literals with normalized values:\n');
  tests.forEach((test, idx) => {
    const subject = new NamedNode(`http://example.org/test#Test${idx + 1}`);
    store.add(new Statement(subject, predicate, test.literal));
    
    console.log(`${idx + 1}. ${test.name}:`);
    console.log(`   Original value: "${test.original}"`);
    console.log(`   Normalized to: "${test.normalized}"`);
    console.log(`   Literal .value: ${test.literal.value}`);
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
    
    // Check if normalization works
    console.log('=== Analysis ===\n');
    const hasTrue = result?.includes('hasBoolean true');
    const hasFalse = result?.includes('hasBoolean false');
    
    console.log(`Found "hasBoolean true": ${hasTrue ? '✅' : '❌'}`);
    console.log(`Found "hasBoolean false": ${hasFalse ? '✅' : '❌'}`);
    
    if (hasTrue && hasFalse) {
      console.log('\n✅ WORKAROUND WORKS: Normalizing "true" to "1" fixes the issue!');
    } else {
      console.log('\n❌ Workaround does not fully work');
    }
  });
}

test().catch(console.error);
