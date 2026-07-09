/**
 * Unit tests for the relationship-legend search term: clicking a relationship dot fills the
 * search box with the concise local name unless it clashes with another displayed relation.
 */
import { describe, it, expect } from 'vitest';
import {
  extractRelationshipLocalName,
  computeLegendSearchTerm,
} from '../../src/ui/edgeStyleUtils';

describe('extractRelationshipLocalName', () => {
  it('returns the fragment after #', () => {
    expect(extractRelationshipLocalName('https://ex.org/onto#hasNote')).toBe('hasNote');
  });
  it('falls back to the last path segment', () => {
    expect(extractRelationshipLocalName('https://ex.org/onto/hasNote')).toBe('hasNote');
  });
  it('returns an already-local name unchanged', () => {
    expect(extractRelationshipLocalName('hasNote')).toBe('hasNote');
    expect(extractRelationshipLocalName('subClassOf')).toBe('subClassOf');
  });
});

describe('computeLegendSearchTerm', () => {
  const types = [
    'https://ex.org/a#hasNote',
    'https://ex.org/a#hasLegend',
    'subClassOf',
  ];

  it('uses just the local name when it is unique', () => {
    expect(computeLegendSearchTerm('https://ex.org/a#hasNote', types)).toBe('hasNote');
    expect(computeLegendSearchTerm('subClassOf', types)).toBe('subClassOf');
  });

  it('uses the full type when the local name clashes across namespaces', () => {
    const clashing = [
      'https://ex.org/a#hasName',
      'https://ex.org/b#hasName', // same local name, different namespace
      'https://ex.org/a#hasNote',
    ];
    expect(computeLegendSearchTerm('https://ex.org/a#hasName', clashing)).toBe(
      'https://ex.org/a#hasName'
    );
    expect(computeLegendSearchTerm('https://ex.org/b#hasName', clashing)).toBe(
      'https://ex.org/b#hasName'
    );
    // The non-clashing one still uses its short form.
    expect(computeLegendSearchTerm('https://ex.org/a#hasNote', clashing)).toBe('hasNote');
  });
});
