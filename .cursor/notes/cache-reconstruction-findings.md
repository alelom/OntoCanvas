# Cache-Based Reconstruction Findings

This document tracks diagnostic findings, quick fix attempts, architectural shortcomings, and potential improvements for fixing OWL restriction preservation in cache-based reconstruction.

## Diagnostic Findings

### Initial Observations

- **Problem**: When renaming a class using cache-based reconstruction, OWL restrictions are lost, resulting in empty blank nodes `[ ]` instead of proper inline forms.
- **Test failures**: 3 out of 10 tests in `owlRestrictionPreservation.test.ts` fail when using cache-based reconstruction
- **Root causes identified**:
  1. Blank node quads may not be properly included in `block.quads`
  2. N3 Writer generates new blank node IDs that don't match original IDs
  3. `buildInlineForms` requires blank nodes as subjects but may only receive them as objects
  4. Property order is lost during full serialization
  5. Targeted label replacement falls through to full serialization when blank nodes are present

### Diagnostic Logging Added

**Location**: `src/parser.ts` - `reconstructFromCache` function
- Logs blank node collection process for class blocks
- Tracks quads count before/after blank node collection
- Compares original vs current blank node IDs
- Logs properties of each blank node
- Special diagnostic logging for DrawingSheet class

**Location**: `src/rdf/sourcePreservation.ts` - `serializeBlockToTurtle` function
- Enhanced logging of inline forms built
- Logs all inline forms, not just the first
- Detailed logging of replacement success/failure
- Logs block subject and quad counts for debugging

## Quick Fix Attempts and Outcomes

### Phase 1: Diagnostic Logging (Completed)
- Added comprehensive diagnostic logging in `reconstructFromCache` and `serializeBlockToTurtle`
- Logs blank node quad collection, inline form building, and replacement success/failure
- Added test helper `verifyBlankNodeQuadsInBlock` to verify blank node quads are present

### Phase 2: Fix Blank Node Quads Collection (Completed)
- Enhanced blank node quads collection in `reconstructFromCache` for both main path and fallback path
- Added deduplication logic to avoid duplicate quads
- Added validation to ensure blank node quads are collected (blank nodes as subjects)
- Added diagnostic logging for DrawingSheet class specifically
- **Outcome**: Blank node quads should now be properly collected

### Phase 3: Fix Blank Node Inlining (Completed)
- Implemented structure-based matching to map N3 Writer output blank node IDs to block.quads blank node IDs
- Parse N3 Writer output to get blank node structures
- Match blank nodes by comparing quad structures (not IDs)
- Create mapping from output blank node ID to inline form
- Replace blank node references using structure-based mapping
- Fall back to order-based replacement if structure matching fails
- **Outcome**: Structure-based matching implemented, but tests still failing

### Phase 4: Preserve Property Order (Completed)
- Enhanced targeted label replacement to handle blocks with restrictions
- Compare blank node structures (not IDs) to verify restrictions haven't changed
- Use targeted replacement even when restrictions are present, if restrictions are unchanged
- **Outcome**: Logic implemented, but tests still failing

### Test Results After Quick Fixes
- **7 tests passing** (tests 1-5, 8-9)
- **3 tests still failing** (tests 6, 7, 10):
  1. Test 6: OWL restrictions not preserved - `onProperty.length` is 0
  2. Test 7: Cardinality constraints not preserved - restriction not found
  3. Test 10: Property order not preserved - subClassOf appears after label

### Analysis of Remaining Failures
The structure-based matching and blank node quads collection appear to be implemented correctly, but the tests are still failing. Possible issues:
1. **Structure-based matching not finding matches**: The blank node structures might not match due to differences in how N3 Writer serializes vs how we parse
2. **Blank node quads not in block.quads**: Even though we collect them, they might not be making it to `serializeBlockToTurtle`
3. **Targeted replacement not being used**: The logic might be falling through to full serialization, which loses property order
4. **Parsing N3 Writer output failing**: The parser might not be able to parse the output correctly, causing structure matching to fail

### Conclusion
The quick fixes have been implemented as specified in the plan:
- ✅ Diagnostic logging added
- ✅ Blank node quads collection enhanced
- ✅ Structure-based matching implemented
- ✅ Targeted replacement enhanced for restrictions
- ✅ Property order preservation attempted

However, **3 out of 10 tests are still failing**, indicating that the quick fixes are not sufficient. The root causes appear to be deeper architectural issues that require more fundamental changes:

1. **N3 Writer limitations**: N3 Writer doesn't serialize blank node definition blocks when blank nodes are only used as objects, making it impossible to parse and match them
2. **ID mismatch problem**: Even with structure-based matching, the fundamental issue of "serialize then fix" remains fragile
3. **Property order loss**: N3 Writer reorders properties, and our attempts to preserve order through targeted replacement are not working when restrictions are present

**Next Steps**: Consider implementing one of the architectural improvements listed in the "Potential Architectural Improvements" section, particularly:
- Custom serializer for blocks with restrictions
- Two-phase serialization (serialize restrictions separately, then integrate)

## Architectural Shortcomings

### Current Architecture Limitations

1. **"Serialize then fix" approach is fragile**
   - N3 Writer serializes first, then we try to fix the output
   - Multiple failure points in the post-processing pipeline
   - Complex logic to match and replace blank node references

2. **N3 Writer ID generation breaks ID-based matching**
   - N3 Writer generates new IDs (`_:df_X_Y`) that don't match original IDs
   - Requires structure-based matching or order-based replacement
   - ID mismatches cause inline form matching to fail

3. **Property order is lost during serialization**
   - N3 Writer reorders properties according to its own algorithm
   - Attempts to preserve order through sorting are incomplete
   - Original text preservation only works when no serialization occurs

4. **Blank node inlining requires complex post-processing**
   - Multiple attempts documented in code (3 failed attempts)
   - Requires parsing output, building inline forms, matching IDs/structures, replacing references
   - Fragile and error-prone

### Potential Architectural Improvements

1. **Custom serializer for blocks with restrictions**
   - Instead of N3 Writer → fix, serialize directly with inline blank nodes
   - Full control over output format
   - Avoids ID mismatch issues entirely
   - **Trade-off**: More code to maintain, but more reliable

2. **Structure-based matching from the start**
   - Match blank nodes by structure (quads) rather than IDs throughout the pipeline
   - Not just during inlining, but during collection and comparison
   - More robust to ID changes
   - **Trade-off**: More complex comparison logic

3. **Avoid serialization when possible**
   - Use original text with targeted replacements for label-only changes
   - Even when restrictions are present, if we can verify they haven't changed
   - Compare blank node structures (not IDs) to detect changes
   - **Trade-off**: Need reliable structure comparison

4. **Separate restriction handling**
   - Treat restrictions as a special case with dedicated serialization logic
   - Don't try to fix N3 Writer output, serialize restrictions separately
   - Integrate restrictions into class block manually
   - **Trade-off**: Special-case logic, but more reliable

5. **Two-phase serialization**
   - First serialize restrictions separately with proper inline forms
   - Then integrate into class block, avoiding N3 Writer's blank node handling entirely
   - **Trade-off**: More complex, but avoids N3 Writer limitations

## Decision Points

_To be filled in as decisions are made_

## Test Insights

_To be filled in as tests are run and analyzed_
