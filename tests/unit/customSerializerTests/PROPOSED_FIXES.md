# Proposed Fixes for Custom Serializer Corruption

## Critical Issues Identified

### Issue 1: `lineStartInBlock` Calculation Bug
**Problem**: Line 2186 uses `blockText.indexOf(line, lineOffset)` which can find the wrong occurrence if the same line text appears multiple times in the block.

**Example**: If a block contains:
```
    rdfs:label "value1" ;
    rdfs:label "value2" ;
```
The second `rdfs:label` line might match the first occurrence instead of the second.

**Fix**: Calculate `lineStartInBlock` based on line numbers and cumulative character positions instead of using `indexOf`.

### Issue 2: Property Regex Matching Incorrectly
**Problem**: The regex `/(\S+)\s+([^;,\n]+?)(?=\s*[;,]|$)/g` can match:
- Partial text when properties span multiple lines
- Overlapping matches
- Incorrect boundaries

**Example**: For line `rdfs:label "example image"@en ;`, the regex might match:
- `rdfs:label "example image"@en` (correct)
- But if the value contains special characters, it might match incorrectly

**Fix**: Use a more precise regex that:
- Properly handles quoted strings (including language tags and datatypes)
- Stops at proper boundaries (semicolon, comma, period)
- Doesn't match across line boundaries incorrectly

### Issue 3: Position Calculation Relative to Block
**Problem**: Positions are calculated as `block.position.start + match.start`, but `match.start` is relative to `blockText`, not the full content. If `lineStartInBlock` is wrong, all positions will be wrong.

**Fix**: Ensure positions are calculated correctly relative to the full content.

### Issue 4: Quad Matching to Property Lines
**Problem**: Quads are matched to property lines by predicate only (`quadsByPredicate.get(match.predicate)`), but:
- Multiple properties can have the same predicate (e.g., multiple `rdfs:label` in different blocks)
- The predicate matching uses prefixed names, but quads use full URIs
- If predicate resolution is wrong, quads won't match

**Fix**: Match quads more precisely by:
- Using the resolved predicate URI
- Matching quads that belong to the same subject as the block
- Ensuring predicate resolution is correct

### Issue 5: Overlapping Replacements
**Problem**: When `performTargetedLineReplacement` replaces text, if property line positions overlap, it will corrupt the text.

**Fix**: 
- Validate that positions don't overlap before replacement
- Sort replacements by position (end to start) to avoid position shifts
- If overlaps are detected, fall back to block-level replacement

## Proposed Implementation Strategy

### Phase 1: Fix `extractPropertyLines`
1. Fix `lineStartInBlock` calculation to use cumulative positions
2. Improve property regex to handle quoted strings correctly
3. Fix position calculations to be relative to full content
4. Improve quad matching to use resolved URIs and subject matching

### Phase 2: Add Validation
1. Add overlap detection in `extractPropertyLines`
2. Add validation in `performTargetedLineReplacement` to check positions
3. Add fallback to block-level replacement if validation fails

### Phase 3: Testing
1. Run all corruption tests to verify fixes
2. Add additional edge case tests
3. Verify round-trip parsing works

## Specific Code Changes Needed

### Change 1: Fix `lineStartInBlock` Calculation
```typescript
// Instead of:
const lineStartInBlock = blockText.indexOf(line, lineOffset);

// Use cumulative position:
let cumulativePos = 0;
for (let j = 0; j < i; j++) {
  cumulativePos += blockLines[j].length + 1; // +1 for newline
}
const lineStartInBlock = cumulativePos;
```

### Change 2: Improve Property Regex
```typescript
// Better regex that handles quoted strings:
const propertyRegex = /(\S+)\s+("(?:[^"\\]|\\.)*"(?:@\w+|^^[^;,\s]+)?|<[^>]+>|\[[^\]]*\]|[^;,\n]+?)(?=\s*[;,]|$)/g;
```

### Change 3: Fix Quad Matching
```typescript
// Match quads by subject AND predicate:
const subjectQuads = store.getQuads(
  DataFactory.namedNode(block.subject),
  null,
  null,
  null
);
const quadsForPredicate = subjectQuads.filter(q => 
  (q.predicate as { value: string }).value === propLine.predicateUri
);
```

### Change 4: Add Overlap Detection
```typescript
// After extracting all property lines, check for overlaps:
for (let i = 0; i < propertyLines.length; i++) {
  for (let j = i + 1; j < propertyLines.length; j++) {
    const p1 = propertyLines[i];
    const p2 = propertyLines[j];
    if (p1.position.start < p2.position.end && p2.position.start < p1.position.end) {
      // Overlap detected - log warning and fall back
      debugWarn('Property line overlap detected:', p1.predicate, p2.predicate);
      return []; // Return empty to force block-level replacement
    }
  }
}
```

## Questions for Clarification

1. **Should we completely disable targeted line replacement if any overlap is detected?** Or should we try to fix overlaps automatically?

2. **How should we handle multi-line properties?** The current logic for finding closing brackets might be incorrect.

3. **Should we add a "strict mode" that validates all positions before replacement?** This would catch issues early but might be slower.

4. **What should happen if quad matching fails?** Should we skip that property line or fall back to block-level replacement?
