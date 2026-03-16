# RDFLib Replacement Plan

**Date:** 2025-01-27
**Status:** Draft - Under Investigation
**Package:** [rdflib](https://www.npmjs.com/package/rdflib) (version 2.3.5)

## Executive Summary

This document outlines a potential plan for replacing N3 Writer with rdflib for RDF serialization, based on experimental findings.

## Current Status

### ✅ Working Features
- **Turtle Serialization:** ✅ Valid syntax (after API fix)
- **Blank Node Handling:** ✅ Works correctly with inline forms
- **Annotation Properties:** ✅ Preserved correctly
- **Multi-Format Support:** ✅ Turtle, RDF/XML, JSON-LD
- **Basic Round-Trip:** ✅ Works for simple cases

### ❌ Known Limitations
- **Comments:** ❌ Not preserved (accepted limitation)
- **Imports:** ✅ **PRESERVED** (was false positive - rdflib uses prefix notation)
- **Round-Trip:** ✅ **RESOLVED** (normalize boolean values to "1"/"0")
- **RDF/XML:** ⚠️ Format validation issue (needs investigation)

### Test Results
- **Total Tests:** 24
- **Passed:** 20 (83.3%) ⬆️ (was 17)
- **Failed:** 4 (16.7%) ⬇️ (was 7)

## Replacement Strategy

### Phase 1: Core Serialization ✅
**Status:** Ready

**Tasks:**
- ✅ Fix API usage (Literal constructor)
- ✅ Implement N3 to rdflib conversion
- ✅ Implement rdflib serialization wrapper
- ✅ Verify valid Turtle syntax output

**Files:**
- `utils/n3ToRdflib.ts` - Conversion utility
- `utils/rdflibSerializer.ts` - Serialization wrapper

### Phase 2: Handle Limitations

#### 2.1 Comments ❌
**Decision:** Accept limitation - comments not preserved

**Rationale:**
- Comments are not semantic data
- Standard limitation for RDF serializers
- Current cache-based reconstruction can be used for comment-heavy files if needed

**Action:** None required

#### 2.2 Imports ✅
**Status:** **RESOLVED** - Imports are preserved

**Finding:** The "not preserved" result was a false positive
- rdflib DOES serialize owl:imports statements
- Uses prefix notation (`exa:import1`) instead of full URIs (`<http://example.org/import1>`)
- Combines multiple imports into comma-separated list
- Both formats are valid Turtle syntax

**Action:** ✅ Fixed comparison logic to handle both formats

#### 2.3 Round-Trip Quad Loss ✅
**Status:** **RESOLVED** - Not a bug, but API usage preference

**Issue:** rdflib's Turtle serializer prefers "1"/"0" over "true"/"false" for boolean literals

**Finding:**
- rdflib's serializer expects "1"/"0" for boolean literals (both are valid RDF lexical forms)
- "true"/"false" values need to be normalized to "1"/"0" before creating Literal
- This is not a bug, but a serializer preference

**Solution:**
- ✅ Updated `n3ToRdflib.ts` to normalize boolean values
- ✅ "true" → "1", "false" → "0" before creating Literal
- ✅ All round-trip tests now pass

**Impact:** Resolved - no longer a blocker

#### 2.4 RDF/XML Format ⚠️
**Status:** Under Investigation

**Issue:** Format validation fails

**Next Steps:**
- Verify if serialization actually works despite validation failure
- Check if it's a validation issue or actual problem

### Phase 3: Integration

**Tasks:**
- Replace N3 Writer calls with rdflib serialization
- Update `storeToTurtle()` to use rdflib
- Handle multi-format export (if needed)
- Update tests

**Considerations:**
- Maintain backward compatibility
- Handle edge cases
- Performance testing

## Decision Criteria

### Must Have (Critical)
- ✅ Valid Turtle syntax
- ✅ Blank node handling
- ✅ Basic round-trip
- ✅ Import preservation (resolved - format difference only)

### Should Have (Important)
- ✅ Annotation properties
- ⚠️ Complete round-trip (investigating)
- ❌ Comments (accepted limitation)

### Nice to Have
- ✅ Multi-format support
- ✅ Property order (if possible)

## Migration Path

### Option A: Full Replacement
- Replace all N3 Writer usage with rdflib
- **Pros:** Single serialization path, multi-format support
- **Cons:** Lose comment preservation, may lose import preservation

### Option B: Hybrid Approach (Recommended)
- Use rdflib for multi-format export (RDF/XML, JSON-LD)
- Keep N3 Writer + cache for Turtle (preserves comments/imports)
- **Pros:** Best of both worlds
- **Cons:** Two serialization paths

### Option C: Conditional Replacement
- Use rdflib for files without comments/imports
- Use N3 Writer + cache for files with comments/imports
- **Pros:** Preserves features when needed
- **Cons:** Complex logic, two paths

## Next Steps

1. ✅ **Comments:** Decision made - accept limitation
2. ✅ **Imports:** Resolved - imports are preserved (format difference only)
3. ✅ **Round-Trip:** Resolved - normalize boolean values to "1"/"0"
4. ⚠️ **RDF/XML:** Verify if validation issue is real
5. **Decision:** Choose migration path based on findings
6. **Implementation:** Execute chosen path

## Notes

- All investigations documented in `investigations/` directory
- Test results in `output/report.json` and `output/report.html`
- API fix documented in `API-FIX-SUMMARY.md`
