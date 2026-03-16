/**
 * Minimal test case for boolean literal serialization
 * Tests rdflib directly without our conversion layer
 */
import { NamedNode, Literal, Store, serialize, Statement } from 'rdflib';

async function test() {
  console.log('=== Minimal Boolean Literal Test ===\n');
  
  // Create a store
  const store = new Store();
  
  // Test 1: Create literal with lexical form "true" and xsd:boolean datatype
  console.log('Test 1: Creating literal with lexical form "true" and xsd:boolean');
  const trueLiteral = new Literal('true', '', new NamedNode('http://www.w3.org/2001/XMLSchema#boolean'));
  console.log('Literal value:', trueLiteral.value);
  console.log('Literal datatype:', trueLiteral.datatype?.value);
  console.log('Literal language:', trueLiteral.language || '(empty)');
  
  // Test 2: Create literal with lexical form "false" and xsd:boolean datatype
  console.log('\nTest 2: Creating literal with lexical form "false" and xsd:boolean');
  const falseLiteral = new Literal('false', '', new NamedNode('http://www.w3.org/2001/XMLSchema#boolean'));
  console.log('Literal value:', falseLiteral.value);
  console.log('Literal datatype:', falseLiteral.datatype?.value);
  
  // Create subjects and predicate
  const subject1 = new NamedNode('http://example.org/test#Test1');
  const subject2 = new NamedNode('http://example.org/test#Test2');
  const predicate = new NamedNode('http://example.org/test#hasBoolean');
  
  // Add statements to store
  console.log('\nTest 3: Adding statements to store');
  store.add(new Statement(subject1, predicate, trueLiteral));
  store.add(new Statement(subject2, predicate, falseLiteral));
  
  console.log('Store size:', store.length);
  
  // Verify what's in the store
  console.log('\nTest 4: Verifying store contents');
  const statements = store.statementsMatching(subject1, predicate, null);
  console.log(`Found ${statements.length} statement(s) for Test1:`);
  statements.forEach((stmt, idx) => {
    const obj = stmt.object;
    console.log(`  Statement ${idx + 1}:`);
    console.log(`    Object value: ${obj.value}`);
    console.log(`    Object datatype: ${obj.datatype?.value || 'none'}`);
    console.log(`    Object language: ${obj.language || 'none'}`);
  });
  
  // Serialize to Turtle
  console.log('\nTest 5: Serializing to text/turtle');
  serialize(null, store, null, 'text/turtle', (err: Error | null, result?: string) => {
    if (err) {
      console.error('Serialization error:', err);
      return;
    }
    
    console.log('Serialized output:');
    console.log(result);
    
    // Check what was serialized
    console.log('\nTest 6: Analyzing serialized output');
    const lines = result?.split('\n') || [];
    lines.forEach((line, idx) => {
      if (line.includes('hasBoolean')) {
        console.log(`  Line ${idx + 1}: ${line.trim()}`);
      }
    });
    
    // Extract boolean values
    const trueMatch = result?.match(/Test1[^\n]*hasBoolean\s+([^\s.]+)/);
    const falseMatch = result?.match(/Test2[^\n]*hasBoolean\s+([^\s.]+)/);
    
    console.log('\nExtracted values:');
    console.log(`  Test1 hasBoolean: ${trueMatch ? trueMatch[1] : 'NOT FOUND'}`);
    console.log(`  Test2 hasBoolean: ${falseMatch ? falseMatch[1] : 'NOT FOUND'}`);
    
    // Check if true was serialized as false
    if (trueMatch && trueMatch[1] === 'false') {
      console.log('\n❌ BUG CONFIRMED: "true"^^xsd:boolean was serialized as "false"');
    } else if (trueMatch && trueMatch[1] === 'true') {
      console.log('\n✅ CORRECT: "true"^^xsd:boolean was serialized as "true"');
    } else {
      console.log(`\n⚠️  UNEXPECTED: "true"^^xsd:boolean was serialized as "${trueMatch?.[1] || 'NOT FOUND'}"`);
    }
  });
}

test().catch(console.error);
