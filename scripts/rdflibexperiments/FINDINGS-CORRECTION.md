# RDFLib Experiments - Important Correction

**Date:** 2025-01-27 (Updated)
**Status:** ⚠️ **INVESTIGATION INCOMPLETE - COMPARISON NEEDS TO BE REMADE**

## Correction to Initial Findings

The initial conclusion that "rdflib produces invalid Turtle syntax using `@<uri>` for datatypes" **may be incorrect**.

### What We Observed
- Test output showed: `"false"@<http://www.w3.org/2001/XMLSchema#boolean>` for typed literals
- This is invalid Turtle syntax (`@` is for language tags, `^^` is for datatypes)

### What rdflib.js Documentation States
- rdflib.js claims to follow standard Turtle/N3 conventions
- Should use `^^` with either prefixed names or `<IRI>` for datatypes
- No documented issues about emitting `@<uri>` for datatypes
- Known issues mention other quirks (e.g., blank nodes as `<...>`), but not this

### Likely Cause
The invalid syntax is **most likely due to incorrect usage of rdflib.js API** in our conversion code rather than a library bug:
1. Our `n3ToRdflib.ts` may be creating Literal objects incorrectly
2. The Literal constructor may require different parameters than we're using
3. We may need to use a different API or method

### Next Steps Required
1. Review rdflib.js documentation for correct Literal constructor usage
2. Test with official rdflib.js examples
3. Verify if the issue is in our conversion code or the library
4. Re-run experiments with corrected implementation
5. Check rdflib.js GitHub issues for similar problems

### Current Status
- ✅ Serialization API works (we can serialize)
- ⚠️ Syntax output may be due to our implementation error
- ❓ Cannot make final conclusion until proper investigation

**The comparison needs to be remade with proper investigation of rdflib.js API usage.**
