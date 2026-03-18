# RDFLib Migration - Test Failures Analysis

**Date**: 2025-01-27  
**Status**: ✅ **ALL RESOLVED**  
**Final Status**: 415 passed, 17 skipped, 0 failed  
**Total Tests**: 432

**Note**: This document was created during the migration to track failures. All issues have been resolved.

## Failure Categories

### 1. Base IRI Parameter Issue (CRITICAL - 15+ failures)
**Error**: `Failed to serialize with rdflib: this.base.lastIndexOf is not a function`

**Affected Tests**:
- `formatPreservation.test.ts` (4 tests)
- `attributionCommentOnly.test.ts` (2 tests)
- `rdfsCommentAttributionDuplication.test.ts` (1 test)
- `roundTrip.test.ts` (1 test)
- `blankNodeInliningRealFile.test.ts` (1 test)
- `saveTtlFunctionality.test.ts` (2 tests)
- `sourcePreservation.test.ts` (2 tests)

**Root Cause**: rdflib's `serialize()` function expects `base` parameter to be a **string URI**, not a `NamedNode` object. When we pass a `NamedNode`, rdflib tries to call `.lastIndexOf()` on it, which fails.

**Fix Required**: Change `base` parameter from `NamedNode | null` to `string | null`, and pass `base.value` or the string directly.

**Location**: `src/rdf/rdflibSerializer.ts:79`

---

### 2. Relative URI Issues (3 failures)
**Error**: `Failed to serialize store with rdflib: NamedNode IRI "img/..." must be absolute.`

**Affected Tests**:
- `exampleImagePersistence.test.ts` - "img/test-image.png"
- `exampleImagePersistence.test.ts` - "img/example1.png"  
- `parser.test.ts` - "img/dgu.png"

**Root Cause**: rdflib requires all NamedNode URIs to be absolute. The tests are using relative URIs like "img/test-image.png" which should be converted to absolute URIs before serialization.

**Note**: As per user, relative URIs should be converted to full URIs in the webGUI before serialization. These test failures indicate that the tests need to be updated to use absolute URIs

**Fix Required**: 
- update tests to use absolute URIs directly

---

### 3. Missing Features in rdflib Output (Not bugs, but missing functionality)

#### 3a. Section Dividers Missing (3 failures)
**Error**: Expected output to contain `#####################################...` (section dividers)

**Affected Tests**:
- `parser.test.ts` - "output includes section dividers and spacing"
- `parser.test.ts` - "output does not repeat section dividers"
- `sourcePreservation.test.ts` - "should preserve structure when no modifications"

**Root Cause**: rdflib doesn't add section dividers. These were added by N3 Writer post-processing.

**Fix Required**: Add post-processing step to insert section dividers after rdflib serialization. The post processing step needs to be modular: we currently only want one step to add the section dividers, but we may want to add other post processing later, although each step needs to be "swappable".

---

#### 3b. Comments Not Preserved (4 failures)
**Error**: Expected output to contain attribution comments like `# Created/edited with https://...`

**Affected Tests**:
- `attributionCommentOnly.test.ts` (3 tests)
- `rdfsCommentAttributionDuplication.test.ts` (2 tests)

**Root Cause**: rdflib doesn't preserve comments (known limitation).

**Fix Required**: Skip the tests adding a comment that this feature was deprecated.

---

#### 3c. Formatting Style Differences (3 failures)
**Error**: Expected specific formatting that N3 Writer produced

**Affected Tests**:
- `parser.test.ts` - "output uses explicit rdf:type and boolean literals (preserves style)"
  - Expected: `rdf:type` (explicit)
  - rdflib may use: `a` (abbreviation)
- `parser.test.ts` - "addObjectPropertyToStore > adds new object property with hasCardinality"
  - Expected: `:hasCardinality "true"`
  - rdflib may use: `:hasCardinality "1"` (due to boolean normalization)

**Root Cause**: rdflib has different serialization preferences than N3 Writer.

**Fix Required**: 
- Add post-processing to normalize formatting. This post processing step will need to be modular and tested independently with respect to other post processing steps.

---

### 4. Blank Node Inlining Format (5 failures)
**Error**: Expected inline blank nodes `[ rdf:type owl:Restriction ... ]` but got different format

**Affected Tests**:
- `blankNodeInlining.test.ts` (5 tests)
  - "should never write blank nodes as _:df_X_Y format"
  - "should not have blank node blocks at the top of the file"
  - "should inline restrictions with classes, not put them at the top"
  - "should handle multiple restrictions on the same class"
  - "should handle nested blank nodes"

**Root Cause**: rdflib may serialize blank nodes differently than expected, or the output format doesn't match test expectations.

**Fix Required**: 
- Verify rdflib's actual blank node serialization format
- If required, as a last resort, add post-processing to normalize blank node format. This has to be modular and separately tested with respect to other post-processing.

---

### 5. owl:imports Not Preserved (3 failures)
**Error**: Expected output to contain `owl:imports` statements

**Affected Tests**:
- `saveTtl.test.ts` - "should preserve external ontology references in serialization"
- `owlImportsDuplication.test.ts` (2 tests)
  - "should not duplicate owl:imports when saving multiple times"
  - "should handle URL normalization (trailing # and /) when detecting duplicates"

**Root Cause**: From experiments, imports were supposed to be preserved. This issue needs investigation.

**Fix Required**: 
- Verify that `owl:imports` quads are in the store
- Check if rdflib serializes them correctly
- Add post-processing if needed. This post processing has to be modular and separately tested with respect to other post-processing steps.

---

### 6. Other Issues (6 failures)

#### 6a. Property Order / Structure (2 failures)
**Affected Tests**:
- `owlRestrictionPreservation.test.ts` - "should preserve all OWL restrictions when renaming a class label"
  - Expected: `'Note'` in restriction
  - Got: `'http://example.org/test#RevisionTable'`
- `sourcePreservation.test.ts` - "should only modify Drawing Sheet label when renaming"
  - Expected: node to be defined
  - Got: undefined

**Root Cause**: May be related to how rdflib serializes restrictions or property order.

---

#### 6b. External Property Detection (1 failure)
**Affected Tests**:
- `externalPropertyDetection.test.ts` - "should not mark local contains property as external"
  - Expected: `"https://burohappoldmachinelearning.github.io/ADIRO/aec-drawing-metadata#"`
  - Got: `"https://burohappoldmachinelearning.github.io/ADIRO/aec_drawing_metadata#"`
  - Difference: `aec-drawing-metadata` vs `aec_drawing_metadata` (hyphen vs underscore)

**Root Cause**: URL mismatch in test expectations vs actual ontology base.

---

#### 6c. Source Preservation Integration (2 failures)
**Affected Tests**:
- `sourcePreservation.test.ts` - "should use cache in storeToTurtle when available"
  - Expected: `'rdf:type owl:Class'`
  - Got: Different format (rdflib output)
- `sourcePreservation.test.ts` - "should preserve prefixed names in inline blank node restrictions"
  - Expected: node to be defined
  - Got: undefined

**Root Cause**: Tests expect cache-based reconstruction output, but rdflib serialization produces different format.

---

#### 6d. GitHub URL Conversion (1 failure)
**Affected Tests**:
- `exampleImagePersistence.test.ts` - "should convert GitHub blob URLs to raw URLs when saving"
  - Expected: `'https://raw.githubusercontent.com/Bur...'`
  - Got: Different URL or missing

**Root Cause**: URL conversion logic may not be working with rdflib serialization.

---

## Priority Fixes

### Critical (Blocks Most Tests)
1. **Base IRI Parameter** - Fix `base` parameter to be string instead of NamedNode (15+ failures)
2. **Relative URI Handling** - Ensure relative URIs are converted to absolute before serialization (3 failures)

### High Priority (Core Functionality)
3. **Section Dividers** - Add post-processing to insert section dividers (3 failures)
4. **Comments** - Add post-processing to insert attribution comments (4 failures)
5. **owl:imports Preservation** - Verify and fix imports serialization (3 failures)

### Medium Priority (Formatting)
6. **Blank Node Format** - Verify and potentially normalize blank node serialization (5 failures)
7. **Formatting Style** - Update test expectations or add normalization (3 failures)

### Low Priority (Edge Cases)
8. **Property Order/Structure** - Investigate and fix (2 failures)
9. **URL Mismatches** - Fix test expectations (1 failure)
10. **Source Preservation Integration** - Update tests for rdflib output (2 failures)
11. **GitHub URL Conversion** - Fix URL conversion logic (1 failure)

---

## Summary by File

| Test File | Failures | Category |
|-----------|----------|----------|
| `formatPreservation.test.ts` | 4 | Base IRI issue |
| `attributionCommentOnly.test.ts` | 3 | Base IRI (2), Comments (1) |
| `blankNodeInlining.test.ts` | 5 | Blank node format |
| `exampleImagePersistence.test.ts` | 3 | Relative URIs (2), URL conversion (1) |
| `owlImportsDuplication.test.ts` | 2 | owl:imports preservation |
| `parser.test.ts` | 7 | Relative URI (1), Section dividers (2), Formatting (2), Blank nodes (1), Property (1) |
| `rdfsCommentAttributionDuplication.test.ts` | 3 | Base IRI (1), Comments (2) |
| `roundTrip.test.ts` | 1 | Base IRI issue |
| `saveTtl.test.ts` | 1 | owl:imports preservation |
| `saveTtlFunctionality.test.ts` | 2 | Base IRI issue |
| `sourcePreservation.test.ts` | 5 | Base IRI (2), Section dividers (1), Structure (2) |
| `blankNodeInliningRealFile.test.ts` | 1 | Base IRI issue |
| `owlRestrictionPreservation.test.ts` | 1 | Property order |
| `externalPropertyDetection.test.ts` | 1 | URL mismatch |
