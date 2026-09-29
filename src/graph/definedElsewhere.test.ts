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

  describe('by URI namespace (no rdfs:isDefinedBy)', () => {
    it('is true when the class URI lives outside the main ontology', () => {
      expect(isDefinedElsewhere({ uri: 'http://www.opengis.net/ont/geosparql#Geometry' }, mainBase)).toBe(true);
    });

    it('is false when the class URI is in the main ontology', () => {
      expect(isDefinedElsewhere({ uri: 'https://w3id.org/adiro/aec_geometry#BoundingBox' }, mainBase)).toBe(false);
    });

    it('handles slash-based namespaces', () => {
      expect(isDefinedElsewhere({ uri: 'http://example.org/other/Thing' }, 'http://example.org/main/')).toBe(true);
      expect(isDefinedElsewhere({ uri: 'http://example.org/main/Thing' }, 'http://example.org/main/')).toBe(false);
    });

    it('cannot judge a bare URI when the main base is unknown (conservative false)', () => {
      expect(isDefinedElsewhere({ uri: 'http://www.opengis.net/ont/geosparql#Geometry' }, null)).toBe(false);
    });

    it('prefers isDefinedBy over the URI namespace when both are present', () => {
      // isDefinedBy points at main → local, even though the URI namespace differs.
      expect(
        isDefinedElsewhere(
          { uri: 'http://www.opengis.net/ont/geosparql#Geometry', isDefinedBy: mainBase },
          mainBase
        )
      ).toBe(false);
    });
  });
});
