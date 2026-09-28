import { describe, it, expect } from 'vitest';
import { isDefinedElsewhere } from './definedElsewhere';

describe('isDefinedElsewhere', () => {
  const mainBase = 'https://w3id.org/adiro/aec_geometry#';

  it('is false when the node has no rdfs:isDefinedBy', () => {
    expect(isDefinedElsewhere({}, mainBase)).toBe(false);
    expect(isDefinedElsewhere({ isDefinedBy: null }, mainBase)).toBe(false);
    expect(isDefinedElsewhere({ isDefinedBy: undefined }, mainBase)).toBe(false);
  });

  it('is true when isDefinedBy points to a namespace outside the main ontology', () => {
    expect(
      isDefinedElsewhere({ isDefinedBy: 'http://www.opengis.net/ont/geosparql#' }, mainBase)
    ).toBe(true);
  });

  it('is false when isDefinedBy points at the main ontology itself (self-defined)', () => {
    // Trailing '#' / no-'#' variants of the same base must all count as local.
    expect(isDefinedElsewhere({ isDefinedBy: 'https://w3id.org/adiro/aec_geometry#' }, mainBase)).toBe(false);
    expect(isDefinedElsewhere({ isDefinedBy: 'https://w3id.org/adiro/aec_geometry' }, mainBase)).toBe(false);
    expect(isDefinedElsewhere({ isDefinedBy: 'https://w3id.org/adiro/aec_geometry/' }, mainBase)).toBe(false);
  });

  it('treats isDefinedBy as elsewhere when the main base is unknown', () => {
    expect(isDefinedElsewhere({ isDefinedBy: 'http://www.opengis.net/ont/geosparql#' }, null)).toBe(true);
  });
});
