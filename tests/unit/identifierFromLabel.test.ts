/**
 * Unit tests for labelToCamelCaseIdentifier.
 *
 * Regression guard for issue #33: deriving an identifier from a label must round-trip
 * for a label that is already a camelCase identifier, otherwise re-opening an edit modal
 * and pressing OK silently renames the term (`assertedBy` -> `assertedby`).
 */
import { describe, it, expect } from 'vitest';
import { labelToCamelCaseIdentifier } from '../../src/lib/identifierFromLabel';
import { deriveNewNodeIdentifier } from '../../src/parser';

describe('labelToCamelCaseIdentifier', () => {
  it('derives camelCase from a prose label', () => {
    expect(labelToCamelCaseIdentifier('created date')).toBe('createdDate');
    expect(labelToCamelCaseIdentifier('Created Date')).toBe('createdDate');
    expect(labelToCamelCaseIdentifier('has value')).toBe('hasValue');
  });

  it('lowercases the initial of a single prose word (class-derivation behaviour is preserved)', () => {
    // addNodeToStore('Corridor') relies on this lowercasing (see minimalDiff.groupEF F4).
    expect(labelToCamelCaseIdentifier('Corridor')).toBe('corridor');
    expect(labelToCamelCaseIdentifier('Building')).toBe('building');
  });

  it('is idempotent for a label that is already a camelCase identifier', () => {
    // The core of issue #33: internal capitals of the first word must be preserved.
    expect(labelToCamelCaseIdentifier('assertedBy')).toBe('assertedBy');
    expect(labelToCamelCaseIdentifier('capturedCaption')).toBe('capturedCaption');
    expect(labelToCamelCaseIdentifier('hasValueEntity')).toBe('hasValueEntity');
    expect(labelToCamelCaseIdentifier('hasXMLValue')).toBe('hasXMLValue');
  });

  it('re-applying the derivation to its own output is a fixed point', () => {
    for (const label of ['created date', 'Corridor', 'assertedBy', 'hasXMLValue', 'Field Assertion']) {
      const once = labelToCamelCaseIdentifier(label);
      expect(labelToCamelCaseIdentifier(once)).toBe(once);
    }
  });
});

describe('deriveNewNodeIdentifier (class labels share the same derivation)', () => {
  it('does not destroy internal capitals of an already-identifier label', () => {
    expect(deriveNewNodeIdentifier('assertedBy')).toBe('assertedBy');
  });
});
