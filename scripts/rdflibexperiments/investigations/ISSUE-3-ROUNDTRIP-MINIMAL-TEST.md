# Minimal Test Case: Boolean Literal Serialization Issue

## Test Case

**File:** `test-boolean-minimal.ts`

**What it does:**
1. Creates rdflib Literal with lexical form `"true"` and datatype `xsd:boolean`
2. Creates rdflib Literal with lexical form `"false"` and datatype `xsd:boolean`
3. Adds both to a Store
4. Serializes to `text/turtle`
5. Both serialize as `false`

## Code

```typescript
import { NamedNode, Literal, Store, serialize, Statement } from 'rdflib';

const store = new Store();
const trueLiteral = new Literal('true', '', new NamedNode('http://www.w3.org/2001/XMLSchema#boolean'));
const falseLiteral = new Literal('false', '', new NamedNode('http://www.w3.org/2001/XMLSchema#boolean'));

const subject1 = new NamedNode('http://example.org/test#Test1');
const subject2 = new NamedNode('http://example.org/test#Test2');
const predicate = new NamedNode('http://example.org/test#hasBoolean');

store.add(new Statement(subject1, predicate, trueLiteral));
store.add(new Statement(subject2, predicate, falseLiteral));

serialize(null, store, null, 'text/turtle', (err, result) => {
  console.log(result);
  // Output:
  // test:Test1 test:hasBoolean false.
  // test:Test2 test:hasBoolean false.
});
```

## Expected vs Actual

**Expected:**
- `test:Test1 test:hasBoolean true.`
- `test:Test2 test:hasBoolean false.`

**Actual:**
- `test:Test1 test:hasBoolean false.` ❌
- `test:Test2 test:hasBoolean false.` ✅

## Observations

1. **Literal Construction:**
   - `new Literal('true', '', xsd:boolean)` creates a literal with `.value = "true"` (string type)
   - `new Literal('false', '', xsd:boolean)` creates a literal with `.value = "false"` (string type)

2. **Store Contents:**
   - Both literals are stored correctly in the store
   - `store.statementsMatching()` shows correct values

3. **Serialization:**
   - Both literals serialize as `false`
   - This happens regardless of original lexical form

## Environment

- **rdflib version:** 2.3.5
- **Node.js version:** 24.13.1
- **Test file:** `scripts/rdflibexperiments/test-boolean-minimal.ts`

## Next Steps

1. Test with different rdflib versions
2. Check rdflib source code for boolean literal serialization
3. Report to rdflib maintainers if confirmed as bug
4. Test alternative serialization formats (RDF/XML, JSON-LD)
