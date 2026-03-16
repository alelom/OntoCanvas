# Issue 1: Comments Not Preserved

## Summary

**Status:** ❌ rdflib does not preserve comments during serialization

**Impact:** Medium - Comments are lost during serialization

## Investigation

### Can rdflib preserve comments?

**Answer: No** - rdflib has no built-in comment preservation.

**Reasons:**
1. Comments are not part of the RDF data model (syntax-level, not semantic)
2. rdflib's `serialize()` function only serializes RDF statements
3. Comments are lost during parsing (not stored in Store)
4. No options in `serialize()` for comment preservation

### Post-Processing Approach

**Tested:** Created `test-comment-preservation.ts` to test post-processing

**Results:**
- ✅ **Section divider comments** can be re-inserted (~50% success)
- ❌ **Inline comments** cannot be reliably placed
- ❌ **Block comments** cannot be reliably placed

**Implementation:** See `utils/commentPreservation.ts`

### Comparison with Current Approach

**Current Codebase (N3 Writer + Cache):**
- ✅ Preserves all comments using source preservation
- ✅ Comments tracked by position in `parseTurtleWithPositions()`
- ✅ Original text preserved when blocks aren't modified

**rdflib:**
- ❌ No comment preservation
- ⚠️ Post-processing possible but imperfect

## Solutions

### Option 1: Accept Limitation ✅ (Recommended for rdflib)
- Comments are not semantic data
- Most RDF serializers don't preserve comments
- Users can manually re-add if needed

### Option 2: Post-Processing for Section Dividers ⚠️
- Extract section dividers from original
- Re-insert after prefix declarations
- **Limitation:** Only works for section dividers, not inline/block comments

### Option 3: Hybrid Approach
- Use cache-based reconstruction for comment-heavy files
- Use rdflib for files without important comments
- **Downside:** Maintains two serialization paths

## Recommendation

**For rdflib usage:**
- **Accept that comments are lost** - this is standard for RDF serializers
- If comments are critical, use current cache-based reconstruction instead
- Post-processing can preserve section dividers if needed, but it's imperfect

**Conclusion:** Comments not being preserved is an expected limitation of rdflib, not a bug. This is acceptable for most use cases.
