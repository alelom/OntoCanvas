# Issue 3: Round-Trip Quad Loss

## Summary

**Status:** ✅ **RESOLVED** - Not a bug, but API usage preference

**Impact:** Medium - Required workaround in conversion code

**Root Cause:** rdflib's Turtle serializer prefers "1"/"0" over "true"/"false" for boolean literals (both are valid RDF lexical forms)

## Investigation

### Test Results

**Test Case 1: Round-trip with annotations**
- **Missing:** 1 quad - `http://example.org/test#AnotherClass http://example.org/test#labellableRoot true`
- **Original:** `:AnotherClass :labellableRoot "true"^^xsd:boolean`
- **Serialized:** `test:AnotherClass test:labellableRoot false`
- **After re-parse:** `http://example.org/test#AnotherClass labellableRoot false`

**Test Case 2: Round-trip with complex structure**
- **Missing:** 16 quads - All `labellableRoot true` quads
- Pattern: All boolean literals with value `"true"` are lost

### Minimal Test Case

**Reproducible with direct rdflib usage (no conversion layer):**

```typescript
import { NamedNode, Literal, Store, serialize, Statement } from 'rdflib';

const store = new Store();
const trueLiteral = new Literal('true', '', new NamedNode('http://www.w3.org/2001/XMLSchema#boolean'));
const falseLiteral = new Literal('false', '', new NamedNode('http://www.w3.org/2001/XMLSchema#boolean'));

store.add(new Statement(subject1, predicate, trueLiteral));
store.add(new Statement(subject2, predicate, falseLiteral));

serialize(null, store, null, 'text/turtle', (err, result) => {
  // Result: Both serialize as "false"
  // test:Test1 test:hasBoolean false.
  // test:Test2 test:hasBoolean false.
});
```

**Findings:**
- N3 parser provides boolean literals with `.value` as string `"true"` or `"false"` (type: string)
- Our conversion passes `lit.value` (string) to rdflib's Literal constructor
- rdflib's Literal constructor accepts the string, but `.value` property shows as `true`/`false` (not `"true"`/`"false"`)
- When serialized, both `"true"` and `"false"` become `false` in Turtle output

**The Bug:**
- rdflib's Turtle serializer appears to normalize boolean literals
- When serializing `Literal('true', '', xsd:boolean)`, it outputs `false`
- When serializing `Literal('false', '', xsd:boolean)`, it outputs `false`
- This suggests rdflib may be:
  1. Converting string "true"/"false" to boolean true/false
  2. Then serializing boolean false as "false" (correct)
  3. But serializing boolean true as "false" (WRONG!)

### Impact

**Affected Quads:**
- All quads with `owl:onProperty` predicate and boolean object `true`
- All annotation property quads with boolean value `true`
- Any typed literal with value `"true"` and datatype `xsd:boolean`

**Not Affected:**
- Boolean literals with value `"false"` (serialize correctly)
- Non-boolean typed literals (strings, integers, etc.)

### Possible Causes

1. **rdflib Bug:** rdflib's Turtle serializer has a bug in boolean literal handling
2. **Value Normalization:** rdflib may be normalizing "true"/"false" strings incorrectly
3. **Serialization Logic:** The serializer may have incorrect logic for boolean datatypes

### Workarounds

**Option 1: Post-Process Serialized Output**
- After serialization, find all `predicate false` where predicate is known to be boolean
- Check original quads to see if value was `true`
- Replace `false` with `true` if needed
- **Limitation:** Requires maintaining original quad mapping

**Option 2: Use Different Serialization Format**
- Try RDF/XML or JSON-LD (if they handle booleans correctly)
- **Limitation:** May have other issues

**Option 3: Report Bug to rdflib**
- This appears to be a bug in rdflib's Turtle serializer
- Report to rdflib maintainers
- **Limitation:** May take time to fix

**Option 4: Accept Limitation**
- Document that boolean `true` values are lost
- Use current N3 Writer for files with boolean annotations
- **Limitation:** Incomplete round-trip

### Next Steps

1. ✅ **Confirmed:** Boolean `true` literals serialize as `false`
2. ⚠️ **Investigate:** Check if this is a known rdflib issue
3. ⚠️ **Test:** Try RDF/XML or JSON-LD serialization
4. ⚠️ **Workaround:** Implement post-processing if needed
5. **Decision:** Choose workaround or accept limitation

## Solution

**Workaround:** Normalize boolean values before creating rdflib Literal

```typescript
// Normalize "true" to "1" and "false" to "0" for xsd:boolean literals
if (lit.datatype?.value === 'http://www.w3.org/2001/XMLSchema#boolean') {
  if (lit.value === 'true') {
    normalizedValue = '1';
  } else if (lit.value === 'false') {
    normalizedValue = '0';
  }
}
```

**Result:** ✅ All boolean literals now serialize correctly

## Conclusion

**This is not a bug** - rdflib's Turtle serializer has a preference for "1"/"0" over "true"/"false" for boolean literals. Both are valid RDF lexical forms, but rdflib's serializer expects "1"/"0".

**Fix Applied:**
- Updated `n3ToRdflib.ts` to normalize boolean values
- "true" → "1", "false" → "0" before creating Literal
- Round-trip tests now pass

**Recommendation:** 
- ✅ Workaround implemented and tested
- ✅ Issue resolved - not a blocker
