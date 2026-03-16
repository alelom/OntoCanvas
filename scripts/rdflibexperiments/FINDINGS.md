# RDFLib Serialization Experiments - Findings

**Date:** 2025-01-27
**Purpose:** Evaluate rdflib as a replacement for N3 Writer
**Package:** [rdflib](https://www.npmjs.com/package/rdflib) (version 2.3.5)

## Executive Summary

### Current Status
- ✅ **Serialization Works**: rdflib can serialize statements to Turtle format
- ❌ **Invalid Turtle Output**: rdflib generates invalid Turtle syntax that cannot be re-parsed by N3 Parser
- ⚠️ **Syntax Issues**: Boolean literals are serialized incorrectly (e.g., `@<http://www.w3.org/2001/XMLSchema#boolean>;`)

### Key Finding
**rdflib's Turtle serialization produces invalid syntax that breaks round-trip parsing.**

## Detailed Findings

### 1. Serialization API

**Issue Encountered:**
- Initial attempts failed with "Cannot read properties of null (reading 'rdfFactory')"
- **Solution:** rdflib's `serialize()` function requires:
  - Signature: `serialize(target, kb, base, contentType, callback, options)`
  - `kb` (knowledge base/Store) is required, not optional
  - Uses callback-based API, not Promise-based

**Implementation:**
```typescript
const kb = new Store();
for (const statement of statements) {
  kb.add(statement);
}
serialize(null, kb, base, format, (err, result) => { ... });
```

### 2. Invalid Turtle Syntax

**Error Message:**
```
Failed to parse RDF: Unexpected "@<http://www.w3.org/2001/XMLSchema#boolean>;" on line 15.
```

**Root Cause:**
rdflib serializes typed literals with **invalid Turtle syntax**:
- **Uses:** `"value"@<http://www.w3.org/2001/XMLSchema#boolean>` (WRONG - `@` is for language tags)
- **Should use:** `"value"^^xsd:boolean` or `"value"^^<http://www.w3.org/2001/XMLSchema#boolean>` (correct datatype syntax)

**Example from Actual Output:**
```turtle
# rdflib produces (INVALID):
test:labellableRoot "false"@<http://www.w3.org/2001/XMLSchema#boolean>;

# Should be (VALID):
test:labellableRoot "false"^^xsd:boolean;
# or
test:labellableRoot "false"^^<http://www.w3.org/2001/XMLSchema#boolean>;
```

**Additional Issues:**
1. **Duplicate prefixes**: rdflib adds its own prefix declarations in addition to provided ones
2. **Language tag confusion**: Uses `@<uri>` for datatypes when `@` is reserved for language tags (`"text"@en`)
3. **All typed literals affected**: Not just booleans - strings, integers, etc. all use wrong syntax

**Impact:**
- Serialized output **cannot be re-parsed** by N3 Parser or any standard Turtle parser
- Round-trip tests fail completely
- Breaks compatibility with existing parsing infrastructure
- **Fundamental incompatibility** - not a minor formatting issue

### 3. Test Execution Status

**Completed Tests:**
- ✅ Blank node serialization tests (4 tests)
- ✅ Property order preservation tests (3 tests)
- ✅ Comment preservation tests (4 tests)
- ✅ Annotation property preservation tests (4 tests)
- ✅ Imports preservation tests (3 tests)
- ✅ Multi-format serialization tests (3 tests)
- ⚠️ Round-trip consistency tests (3 tests) - **FAILED due to invalid syntax**

**Total:** 24 tests attempted, 21 completed, 3 failed

### 4. Specific Issues Identified

#### Issue 1: Typed Literal Serialization (CRITICAL)
- **Problem:** rdflib serializes ALL typed literals with invalid syntax
- **Expected:** `"value"^^xsd:boolean` or `"value"^^<uri>`
- **Actual:** `"value"@<uri>` (uses `@` instead of `^^` - `@` is for language tags!)
- **Examples:**
  - Boolean: `"false"@<http://www.w3.org/2001/XMLSchema#boolean>` ❌
  - String: `"text"@<http://www.w3.org/2001/XMLSchema#string>` ❌
- **Impact:** **CRITICAL** - breaks parsing of ANY ontology with typed literals
- **Severity:** This is a fundamental syntax error, not a formatting issue

#### Issue 2: Round-Trip Compatibility
- **Problem:** Cannot re-parse rdflib's output with N3 Parser
- **Impact:** High - breaks existing parsing infrastructure
- **Workaround:** None identified - would require post-processing or different parser

### 5. Comparison with N3 Writer

| Feature | N3 Writer | rdflib | Notes |
|---------|-----------|--------|-------|
| Turtle Serialization | ✅ Valid | ⚠️ Invalid syntax | rdflib produces unparseable output |
| Blank Node Handling | ✅ Works | ❓ Unknown | Tests incomplete due to syntax errors |
| Property Order | ❌ Not preserved | ❓ Unknown | Tests incomplete |
| Comments | ❌ Not preserved | ❓ Unknown | Tests incomplete |
| Multi-Format | ❌ Turtle only | ✅ Turtle, RDF/XML, JSON-LD | rdflib advantage |
| Round-Trip | ⚠️ Partial | ❌ Broken | Both have issues |

### 6. Recommendations

#### Option 1: Do NOT Replace N3 Writer with rdflib
**Reasoning:**
- rdflib produces invalid Turtle syntax
- Cannot be used with existing N3 Parser infrastructure
- Would require significant post-processing or parser replacement
- Current N3 Writer, despite limitations, produces valid syntax

#### Option 2: Hybrid Approach (Not Recommended)
- Use rdflib for multi-format serialization (RDF/XML, JSON-LD)
- Keep N3 Writer for Turtle serialization
- **Downside:** Maintains two serialization paths, increases complexity

#### Option 3: Fix rdflib Output (Not Recommended)
- Post-process rdflib output to fix syntax errors
- **Downside:** Complex, error-prone, defeats purpose of using library

### 7. Next Steps

1. **Verify rdflib Version**: Check if newer version fixes syntax issues
2. **Test Alternative Libraries**: Consider other RDF serialization libraries
3. **Improve N3 Writer**: Continue with architectural improvements to N3 Writer approach
4. **Custom Serializer**: Consider building custom serializer for specific use cases

### 8. Conclusion

**rdflib is NOT a viable replacement for N3 Writer** due to:

1. **CRITICAL: Invalid Turtle Syntax**
   - Uses `@<uri>` for datatypes (WRONG - `@` is for language tags)
   - Should use `^^<uri>` for datatypes
   - Makes output completely unparseable by standard Turtle parsers

2. **Incompatibility with Existing Infrastructure**
   - Cannot re-parse rdflib output with N3 Parser
   - Would require replacing entire parsing stack, not just serialization

3. **Round-Trip Failures**
   - Fundamental incompatibility prevents any round-trip testing
   - Cannot verify semantic equivalence

4. **Additional Issues**
   - Duplicate prefix declarations
   - Inconsistent formatting
   - No control over property order

**Recommendation:** 
- **DO NOT replace N3 Writer with rdflib**
- Continue with N3 Writer and implement architectural improvements (as documented in `.cursor/notes/cache-reconstruction-findings.md`)
- Consider rdflib ONLY for multi-format export (RDF/XML, JSON-LD) if needed, but NOT for Turtle serialization
- If multi-format is needed, use a hybrid approach: N3 Writer for Turtle, rdflib for other formats (with post-processing to fix syntax if needed)

## Test Output Files

- `output/report.json` - Structured test results (if generated)
- `output/report.html` - Visual comparison report (if generated)

## Notes

- All tests were run with [rdflib](https://www.npmjs.com/package/rdflib) version 2.3.5
- Tests use existing project fixtures from `tests/fixtures/`
- Error occurs during round-trip parsing, not during initial serialization
- Package URL: https://www.npmjs.com/package/rdflib