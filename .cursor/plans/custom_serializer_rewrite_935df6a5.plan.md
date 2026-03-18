---
name: Custom Serializer Rewrite
overview: Rewrite the custom serializer's property line extraction mechanism using a state machine parser with parallel text/quad parsing and cross-validation. Implement extensive test-first approach covering all edge cases before implementation.
todos: []
isProject: false
---

# Custom Serializer Rewrite - Implementation Plan

## Overview

Complete rewrite of `extractPropertyLines` and related functions using:

- **Option C**: Parse text and quads in parallel, cross-validate (maximum robustness)
- **State machine parser**: Minimal regex, proper handling of quoted strings, brackets, URIs
- **Quad matching**: Predicate + object value + position proximity (within same block)
- **Extended PropertyLine interface**: Add `quadPositions`, `confidence`, `validationErrors`, `subProperties`
- **Lazy evaluation**: Memoization at block level (Option D)
- **Error handling**: Clear error messages, no fallback to block-level replacement

## Phase 1: Extended Tests (Test-First Approach)

### 1.1 Update Existing Tests

- **File**: `tests/unit/customSerializerTests/corruption.test.ts`
  - All 6 tests should fail initially (expected)
  - Keep as-is, they validate the corruption issues
- **File**: `tests/unit/customSerializerTests/propertyLineExtraction.test.ts`
  - Uncomment and update TODO sections
  - Add assertions for new PropertyLine fields (`quadPositions`, `confidence`, `validationErrors`)
- **File**: `tests/unit/customSerializerTests/formattingPreservation.test.ts`
  - Uncomment TODO sections
  - Add tests for multi-line property formatting preservation

### 1.2 New Edge Case Tests

Create `tests/unit/customSerializerTests/stateMachineParser.test.ts`:

**Test Categories:**

1. **Quoted String Handling**
  - Simple strings: `"value"`
  - Strings with escapes: `"value with \"quote\""`
  - Language tags: `"value"@en`
  - Datatypes: `"value"^^xsd:string`
  - Combined: `"value"@en^^xsd:string` (invalid but should handle gracefully)
2. **Bracket Handling**
  - Simple brackets: `[ ... ]`
  - Nested brackets: `[ [ ... ] ]`
  - Brackets in strings: `"text [ with brackets ]"`
  - Multi-line brackets with proper indentation
3. **URI Handling**
  - Prefixed names: `rdfs:label`, `:localName`
  - Full URIs: `<http://example.org/test#Class>`
  - URIs in brackets: `[ owl:onProperty <http://...> ]`
4. **Property Boundary Detection**
  - Single-line properties
  - Multi-line properties (restrictions)
  - Comma-separated properties on same line
  - Semicolon-separated properties
  - Mixed separators
5. **Position Calculation**
  - Character positions relative to full content
  - Line number tracking
  - Multi-line property positions
  - Overlap detection
6. **Quad Matching**
  - Exact matches (predicate + object value)
  - Proximity-based matching (character distance, line distance)
  - Multiple quads for same predicate
  - Unmatched quads (should error)
  - Quads matching multiple properties (should error)
7. **Validation Scenarios**
  - Overlapping property lines (should error)
  - Property with no matching quads (should error)
  - Multiple quads match same property (should error)
  - Quad matches multiple properties (should error)
8. **Multi-line Property Structure**
  - Single restriction on multiple lines
  - Multiple restrictions (comma-separated)
  - Restrictions with nested properties
  - Preserve formatting (indentation, line breaks)
9. **Edge Cases from Existing Tests**
  - Empty blank nodes (from `edgeCases.test.ts`)
  - Nested blank nodes
  - Cardinality constraints
  - Empty classes
  - Complex ontologies

### 1.3 Test Fixtures

Create additional fixtures in `tests/fixtures/customSerializerFixtures/`:

- `quoted-strings.ttl` - Various quoted string formats
- `bracket-nesting.ttl` - Nested bracket structures
- `uri-variations.ttl` - Different URI formats
- `overlapping-properties.ttl` - Test case for overlap detection
- `unmatched-quads.ttl` - Test case for unmatched quad error
- `multi-restriction-formatting.ttl` - Multiple restrictions with specific formatting

### 1.4 Test Helpers

Update `tests/unit/customSerializerTests/helpers.ts`:

- Add helper to extract property lines and validate structure
- Add helper to check for overlaps
- Add helper to verify quad positions
- Add helper to calculate proximity scores

## Phase 2: Extended PropertyLine Interface

### 2.1 Update Interface

**File**: `src/rdf/sourcePreservation.ts` (lines 95-103)

```typescript
export interface PropertyLine {
  predicate: string;
  predicateUri: string;
  position: TextPosition;
  originalLineText: string;
  quads: N3Quad[];
  quadPositions: Map<N3Quad, TextPosition>;  // NEW: Individual quad positions
  isMultiLine: boolean;
  lineNumbers: number[];
  confidence: number;  // NEW: Match confidence (0-1)
  validationErrors: string[];  // NEW: Validation issues
  subProperties?: PropertyLine[];  // NEW: For multi-line properties (restrictions)
}
```

### 2.2 Update All PropertyLine Usage

- Update `extractPropertyLines` return type
- Update `detectPropertyLevelChanges` to handle new fields
- Update `performTargetedLineReplacement` to use new fields
- Update all test files that create/mock PropertyLine objects

## Phase 3: State Machine Parser

### 3.1 Create State Machine

**File**: `src/rdf/propertyLineParser.ts` (new file)

**States:**

- `START` - Beginning of property
- `PREDICATE` - Reading predicate
- `VALUE_START` - Start of value
- `STRING` - Inside quoted string (handles escapes)
- `LANGUAGE_TAG` - After string, reading `@en`
- `DATATYPE` - After string, reading `^^xsd:string`
- `BRACKET` - Inside `[...]` (tracks depth)
- `URI` - Inside `<...>`
- `SEPARATOR` - Reading `;` or `,`
- `END` - End of property

**Parser Function:**

```typescript
export function parsePropertyLinesWithStateMachine(
  blockText: string,
  blockStartPosition: number,
  blockStartLine: number
): PropertyLineMatch[] {
  // State machine implementation
  // Returns array of property matches with positions
}
```

**Interface:**

```typescript
interface PropertyLineMatch {
  predicate: string;
  predicateStart: number;
  predicateEnd: number;
  valueStart: number;
  valueEnd: number;
  fullStart: number;  // Start of entire property (including whitespace)
  fullEnd: number;    // End of entire property (including separator)
  lineNumbers: number[];
  isMultiLine: boolean;
  rawText: string;
}
```

### 3.2 Handle Edge Cases in State Machine

- Escaped quotes in strings: `"value with \"quote\""`
- Escaped backslashes: `"value with \\backslash"`
- Nested brackets with proper depth tracking
- URIs with special characters
- Comments within properties (should skip)
- Whitespace handling (preserve original)

## Phase 4: Parallel Text/Quad Parsing

### 4.1 Rewrite `extractPropertyLines`

**File**: `src/rdf/sourcePreservation.ts` (lines 2084-2290)

**New Implementation:**

1. Parse block text using state machine → get `PropertyLineMatch[]`
2. Get block quads from `block.quads`
3. For each property match:
  - Find matching quads by predicate + object value + proximity
  - Calculate quad positions within property text
  - Calculate confidence score
  - Validate (check for errors)
4. Cross-validate: ensure all quads are matched, all properties have quads
5. Create PropertyLine objects with all fields populated

**Key Functions:**

```typescript
function matchQuadsToProperty(
  propertyMatch: PropertyLineMatch,
  blockQuads: N3Quad[],
  blockSubject: string,
  prefixMap: Map<string, string>
): {
  matchedQuads: N3Quad[];
  quadPositions: Map<N3Quad, TextPosition>;
  confidence: number;
  errors: string[];
}

function calculateProximity(
  propertyPosition: TextPosition,
  expectedQuadPosition: number,  // Based on block structure
  quad: N3Quad
): number {
  // Combination of character distance, line distance, relative position
  // Returns score (lower = closer)
}

function validatePropertyLines(
  propertyLines: PropertyLine[]
): string[] {
  // Check for overlaps
  // Check for unmatched quads
  // Check for duplicate matches
  // Returns array of error messages
}
```

### 4.2 Error Classes

**File**: `src/rdf/sourcePreservation.ts` (add after interfaces)

```typescript
export class PropertyLineExtractionError extends Error {
  constructor(
    message: string,
    public block: StatementBlock,
    public propertyLines?: PropertyLine[],
    public quads?: N3Quad[],
    public validationErrors?: string[]
  ) {
    super(message);
    this.name = 'PropertyLineExtractionError';
  }
}
```

## Phase 5: Lazy Evaluation and Caching

### 5.1 Add Cache to StatementBlock

**File**: `src/rdf/sourcePreservation.ts` (update StatementBlock interface around line 60-80)

Add optional field:

```typescript
export interface StatementBlock {
  // ... existing fields
  _cachedPropertyLines?: PropertyLine[];  // Lazy cache
}
```

### 5.2 Implement Lazy Evaluation

**File**: `src/rdf/sourcePreservation.ts` (in `extractPropertyLines`)

```typescript
export function extractPropertyLines(
  block: StatementBlock,
  cache: OriginalFileCache
): PropertyLine[] {
  // Check cache first
  if (block._cachedPropertyLines) {
    return block._cachedPropertyLines;
  }
  
  // Parse and extract
  const propertyLines = extractPropertyLinesInternal(block, cache);
  
  // Cache result
  block._cachedPropertyLines = propertyLines;
  
  return propertyLines;
}
```

**Note**: Since `OriginalFileCache` is immutable (created from original file), cache never needs invalidation. If modifications occur, a new cache is created.

## Phase 6: Multi-line Property Handling

### 6.1 Parse Multi-line Properties

In state machine parser:

- Track bracket depth
- When `[` encountered, enter `BRACKET` state
- Track all lines until matching `]`
- Preserve all formatting (indentation, line breaks)

### 6.2 Create Sub-properties for Restrictions

For `rdfs:subClassOf [ ... ], [ ... ]`:

- One PropertyLine for entire `rdfs:subClassOf` property
- `subProperties` array with PropertyLine for each `[...]` restriction
- Each sub-property tracks its own quads and positions

### 6.3 Preserve Formatting

- Track original indentation levels
- Preserve line breaks between restrictions
- Preserve spacing around commas/semicolons

## Phase 7: Integration and Validation

### 7.1 Update `detectPropertyLevelChanges`

**File**: `src/rdf/sourcePreservation.ts` (lines 2309-2433)

- Use new PropertyLine structure
- Handle `quadPositions` for precise matching
- Use `confidence` scores to prioritize matches
- Check `validationErrors` before processing

### 7.2 Update `performTargetedLineReplacement`

**File**: `src/rdf/sourcePreservation.ts` (lines 2472-2592)

- Use `quadPositions` for precise replacement
- Handle multi-line properties using `subProperties`
- Preserve formatting from `originalLineText`
- Validate positions don't overlap (should never happen with new implementation)

### 7.3 Update `reconstructFromCache`

**File**: `src/parser.ts` (around line 2584)

- Ensure it calls new `extractPropertyLines`
- Handle `PropertyLineExtractionError` appropriately
- Never fall back to block-level replacement (per requirements)

## Phase 8: Testing and Validation

### 8.1 Run All Tests

- All corruption tests should pass
- All property line extraction tests should pass
- All edge case tests should pass
- All formatting preservation tests should pass

### 8.2 Test Error Cases

- Verify errors are thrown for overlaps
- Verify errors are thrown for unmatched quads
- Verify errors are thrown for duplicate matches
- Verify error messages are clear and actionable

### 8.3 Performance Testing

- Verify lazy evaluation works (cache hit on second call)
- Verify state machine is efficient
- Verify no memory leaks from caching

## Implementation Order

1. **Phase 1**: Write all tests (they should fail)
2. **Phase 2**: Update PropertyLine interface
3. **Phase 3**: Implement state machine parser
4. **Phase 4**: Implement parallel parsing and quad matching
5. **Phase 5**: Add lazy evaluation
6. **Phase 6**: Handle multi-line properties
7. **Phase 7**: Integrate with existing code
8. **Phase 8**: Test and validate

## Success Criteria

- All existing corruption tests pass
- All new edge case tests pass
- No overlapping property lines
- All quads matched to properties
- Clear error messages for all error cases
- Formatting preserved exactly
- Performance acceptable (lazy evaluation working)
- Code is maintainable and well-documented

