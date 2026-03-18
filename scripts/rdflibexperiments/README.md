# RDFLib Serialization Experiments

This directory contains an experimentation suite to evaluate `rdflib`'s capabilities for replacing N3 Writer in the ontology editor project.

**Package:** [rdflib](https://www.npmjs.com/package/rdflib) (version 2.3.5)

## Overview

The suite tests critical serialization requirements identified from the codebase:

- **Blank Node Serialization**: Serialize blank nodes used as objects (OWL restrictions) with inline forms `[ ... ]`
- **Property Order Preservation**: Preserve original property order (e.g., `subClassOf` before `label` before `comment`)
- **Comment Preservation**: Retain all comments (section dividers, inline comments, block comments)
- **Annotation Properties**: Preserve annotation properties (e.g., `:labellableRoot false`, `:exampleImage`)
- **Imports Preservation**: Preserve `owl:imports` statements in ontology declaration
- **Prefix Handling**: Support both colon notation (`:Class`) and base notation (`<#Class>`)
- **Multi-Format Serialization**: Serialize to Turtle, RDF/XML, JSON-LD
- **Round-Trip Consistency**: Parse → serialize → parse should preserve all data

## Structure

```
scripts/rdflibexperiments/
├── fixtures/                    # Test fixtures
│   ├── simple-restriction.ttl
│   ├── multiple-restrictions.ttl
│   ├── nested-blank-nodes.ttl
│   ├── with-comments.ttl
│   ├── with-annotations.ttl
│   └── with-imports.ttl
├── utils/
│   ├── n3ToRdflib.ts          # Convert N3 quads to rdflib statements
│   ├── rdflibSerializer.ts    # Wrapper for rdflib serialization
│   ├── comparison.ts          # Compare outputs
│   └── reportGenerator.ts     # Generate console/JSON/HTML reports
├── scenarios/
│   ├── blankNodes.test.ts     # Test blank node serialization
│   ├── propertyOrder.test.ts # Test property order preservation
│   ├── comments.test.ts       # Test comment preservation
│   ├── annotations.test.ts    # Test annotation properties
│   ├── imports.test.ts        # Test owl:imports preservation
│   ├── multiFormat.test.ts    # Test multi-format serialization
│   └── roundTrip.test.ts      # Test parse → serialize → parse
├── main.ts                    # Orchestrator: run all scenarios
├── output/                    # Generated reports (created on run)
│   ├── report.json
│   └── report.html
└── README.md                  # This file
```

## Running the Experiments

### Run All Experiments

```bash
npm run experiment:rdflib
```

This will:
1. Run all test scenarios
2. Generate console output with pass/fail indicators
3. Generate JSON report in `scripts/rdflibexperiments/output/report.json`
4. Generate HTML report in `scripts/rdflibexperiments/output/report.html`

### Output

The experiments generate three types of reports:

1. **Console Report**: Colored output with pass/fail indicators, printed to stdout
2. **JSON Report**: Structured data for programmatic analysis (`output/report.json`)
3. **HTML Report**: Visual side-by-side comparison with syntax highlighting (`output/report.html`)

## Success Criteria

For `rdflib` to be considered a viable replacement for N3 Writer:

1. ✅ **Blank Node Serialization**: Must serialize blank node definitions when used as objects
2. ✅ **Inline Forms**: Must create inline forms `[ ... ]` automatically
3. ✅ **Property Order**: Must preserve or allow control of property order
4. ✅ **Comments**: Must preserve comments (or provide mechanism to do so)
5. ✅ **Round-Trip**: Must maintain semantic equivalence
6. ⚠️ **Multi-Format**: Nice to have but not critical for initial replacement

## ⚠️ Status Note

**The initial experiments showed syntax issues, but these may be due to incorrect API usage rather than library problems.** According to rdflib.js documentation, it should use standard Turtle syntax. The comparison needs to be remade with proper investigation of the rdflib.js API. See `FINDINGS.md` for details.

## Test Scenarios

### 1. Blank Node Serialization

Tests whether blank nodes used as objects (OWL restrictions) are serialized correctly with inline forms.

**Test Cases:**
- Simple restriction (one blank node)
- Multiple restrictions (4 blank nodes like DrawingSheet)
- Nested blank nodes
- Real-world example (aec_drawing_metadata.ttl)

**Verification:**
- Are blank node definitions serialized?
- Are inline forms `[ ... ]` created?
- Are all restriction properties preserved?

### 2. Property Order

Tests whether property order is preserved during serialization.

**Test Cases:**
- Class with restrictions (subClassOf, label, comment, type, annotation)
- Simple class (label, comment, type)
- Real-world example

**Verification:**
- Does property order match original?
- Can we control property order?

### 3. Comments

Tests whether comments are preserved during serialization.

**Test Cases:**
- Section divider comments (`################################`)
- Inline comments (`# inline comment`)
- Block comments before statements
- Comments-only file

**Verification:**
- Are all comments preserved?
- Are comment positions maintained?

### 4. Annotation Properties

Tests whether annotation properties are preserved.

**Test Cases:**
- Boolean annotations (`:labellableRoot false`)
- String annotations (`:exampleImage <uri>`)
- Multiple annotations on same class

**Verification:**
- Are annotations serialized correctly?
- Are boolean values preserved as booleans or converted to strings?

### 5. Imports

Tests whether `owl:imports` statements are preserved.

**Test Cases:**
- Single import
- Multiple imports
- Import order preservation

**Verification:**
- Are imports preserved in ontology declaration?
- Is import order maintained?

### 6. Multi-Format

Tests serialization to different RDF formats.

**Test Cases:**
- Serialize to Turtle
- Serialize to RDF/XML
- Serialize to JSON-LD

**Verification:**
- Can rdflib serialize to all formats?
- Are blank nodes handled correctly in each format?

### 7. Round-Trip

Tests parse → serialize → parse consistency.

**Test Cases:**
- Parse → serialize → parse with restrictions
- Parse → serialize → parse with annotations
- Parse → serialize → parse with complex structure

**Verification:**
- Are all quads preserved?
- Is semantic equivalence maintained?

## Next Steps

After running the experiments:

1. **If rdflib passes all criteria**: Plan migration strategy
2. **If rdflib fails some criteria**: Document failures and consider:
   - Hybrid approach (rdflib for some cases, custom for others)
   - Alternative libraries
   - Custom serializer for specific cases

## Dependencies

- `rdflib`: RDF library for parsing and serialization - [npm package](https://www.npmjs.com/package/rdflib) (version 2.3.5)
- `n3`: Current RDF library (for comparison) - [npm package](https://www.npmjs.com/package/n3)
- `tsx`: TypeScript execution (for running experiments)

## Notes

- These are **experiments**, not proper unit tests
- The goal is to verify `rdflib`'s capabilities before committing to migration
- Reports help identify specific areas where `rdflib` may need custom handling
