# API Usage Fix Summary

## Problem Identified

The initial conclusion that "rdflib produces invalid Turtle syntax" was **incorrect**. The issue was in our API usage, not the library.

## The Bug

In `utils/n3ToRdflib.ts`, we were incorrectly using the Literal constructor:

```typescript
// WRONG - passing datatype as second parameter (language)
if (lit.datatype) {
  return new Literal(lit.value, new NamedNode(lit.datatype.value));
}
```

## The Fix

The rdflib Literal constructor signature is:
```typescript
constructor(value: string, language: string, datatype: NamedNode)
```

We needed to pass an empty string for the language parameter:

```typescript
// CORRECT - Literal constructor: (value, language, datatype)
if (lit.datatype) {
  return new Literal(lit.value, '', new NamedNode(lit.datatype.value));
}
```

## Result

After the fix:
- ✅ rdflib now correctly serializes typed literals
- ✅ Round-trip parsing works
- ✅ 14/24 tests pass (58.3%)
- ✅ Blank node serialization works correctly
- ✅ Multi-format support works (Turtle, JSON-LD)

## Updated Results

See `FINDINGS-UPDATED.md` for complete updated test results after the API fix.
