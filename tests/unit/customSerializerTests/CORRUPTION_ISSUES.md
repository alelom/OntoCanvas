# Custom Serializer Corruption Issues

## Summary
When using the custom serializer to rename a simple label (e.g., "Drawing Sheet" to "Drawing Sheeta"), the output TTL file becomes severely corrupted with text duplication, overlapping replacements, and invalid syntax.

## Issues Identified

### Issue 1: Text Duplication and Corruption
**Symptom**: Properties are being duplicated and corrupted with partial text fragments.
- Example: `:exampleImage rdfs:label "example image"@en ;` becomes `:exampleImage rdfs:label "example image"@en ; rdimage"@en ;`
- Example: `:labellableRoot rdfs:label "Labellable root";` becomes `:labellableRoot rdfs:label "Labellable root"; rdfllable root";` (repeated multiple times)

**Test**: `should not corrupt other properties when renaming DrawingSheet label`
**Status**: ❌ FAILING - Text corruption detected

### Issue 2: Overlapping Property Line Replacements
**Symptom**: Properties are being replaced at incorrect positions, causing overlapping replacements.
- Properties appear multiple times in the same block
- Text is inserted in the middle of other properties

**Test**: `should not have overlapping property line replacements`
**Status**: ❌ FAILING - Properties duplicated (0 occurrences found instead of 1)

### Issue 3: Incorrect Position Calculations
**Symptom**: Property line positions are calculated incorrectly, causing replacements at wrong positions.
- Unchanged blocks are being modified
- Text structure is not preserved

**Test**: `should preserve exact text structure for unchanged properties`
**Status**: ❌ FAILING - Unchanged blocks are being corrupted (e.g., `:Note` block shows `sOf :Note;` instead of `rdfs:subClassOf :Note;`)

### Issue 4: Multiple Matches for Same Property
**Symptom**: The regex is matching the same property multiple times on the same line or block.
- Properties appear 4+ times in a single block
- Each property should appear at most once (except `rdfs:subClassOf`)

**Test**: `should not duplicate properties within the same block`
**Status**: ❌ FAILING - Properties duplicated (4 occurrences found)

### Issue 5: Invalid Turtle Syntax
**Symptom**: The serialized output contains invalid Turtle syntax that cannot be parsed.
- Example: `Unexpected "rdimage"@en" on line 25`
- The output is not valid RDF/Turtle

**Test**: `should correctly identify property line boundaries`
**Status**: ❌ FAILING - Output is not valid Turtle

### Issue 6: Changed Property Not Applied
**Symptom**: The intended change (label rename) is not being applied correctly.
- The new label value is not found in the output
- The DrawingSheet block structure is corrupted

**Test**: `should only modify the changed property line in DrawingSheet block`
**Status**: ❌ FAILING - Label change not found in output

## Root Cause Analysis

Based on the test failures and code inspection, the issues appear to stem from:

1. **`extractPropertyLines` function**:
   - The regex `/(\S+)\s+([^;,\n]+?)(?=\s*[;,]|$)/g` is matching too much or too little
   - Position calculations (`lineStartInBlock + propMatch.index!`) may be incorrect when `lineStartInBlock` is calculated using `indexOf`, which can find the wrong occurrence
   - Property boundaries are not correctly identified, especially for multi-line properties

2. **`performTargetedLineReplacement` function**:
   - When replacing text, positions may overlap if `extractPropertyLines` calculated them incorrectly
   - The replacement logic doesn't validate that positions don't overlap
   - Text is being replaced at positions that span multiple properties

3. **`detectPropertyLevelChanges` function**:
   - May be detecting changes in properties that haven't actually changed
   - The quad comparison logic might not be correctly matching quads to property lines

## Test Results

All 6 tests are currently failing, confirming the corruption issues:

```
Test Files  1 failed (1)
Tests  6 failed (6)
```

## Next Steps

1. Fix `extractPropertyLines` to correctly identify property boundaries
2. Fix position calculations to avoid overlaps
3. Add validation in `performTargetedLineReplacement` to prevent overlapping replacements
4. Fix `detectPropertyLevelChanges` to only detect actual changes
5. Re-run tests to verify fixes
