# E2E Tests for Edit Edge Modal

These tests verify that the Edit Edge modal correctly displays cardinality and restriction checkbox for object property restrictions.

## Prerequisites

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the dev server:
   ```bash
   npm run dev
   ```

   The dev server should be running on `http://localhost:5173/`

## Running Tests

Run E2E tests:
```bash
npm run test:e2e
```

Run E2E tests in watch mode:
```bash
npm run test:e2e:watch
```

## Test Files

- `editEdgeModal.e2e.test.ts` - Tests for Edit Edge modal functionality
- `../fixtures/simple-object-property.ttl` - Test ontology with simple object property (no restriction)
- `../fixtures/simple-restriction.ttl` - Test ontology with object property restriction (minCardinality: 2)

## Test Cases

1. **Simple Object Property Test**: Verifies that a non-restriction edge shows empty cardinality fields and unchecked "OWL restriction" checkbox.

2. **Restriction Test**: Verifies that a restriction edge shows `Min: 2`, empty `Max`, and checked "OWL restriction" checkbox.

## Notes

- Tests use Playwright's browser automation API within Vitest
- Tests require the dev server to be running
- Tests use the `__EDITOR_TEST__` hook exposed by the editor for programmatic control
