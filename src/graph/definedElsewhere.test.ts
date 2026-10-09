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

  describe('an ontology whose IRI ends in a slash, such as FOAF (#114)', () => {
    // getMainOntologyBase turns <http://xmlns.com/foaf/0.1/> into <http://xmlns.com/foaf/0.1/#>.
    const foaf = 'http://xmlns.com/foaf/0.1/#';

    it('treats its own terms as its own, by rdfs:isDefinedBy and by URI', () => {
      expect(isDefinedElsewhere({ isDefinedBy: 'http://xmlns.com/foaf/0.1/' }, foaf)).toBe(false);
      expect(isDefinedElsewhere({ uri: 'http://xmlns.com/foaf/0.1/Person' }, foaf)).toBe(false);
      expect(isDefinedElsewhere({ uri: 'http://xmlns.com/foaf/0.1/Person', isDefinedBy: 'http://xmlns.com/foaf/0.1/' }, foaf)).toBe(false);
    });

    it('still sees a term of another ontology as defined elsewhere', () => {
      expect(isDefinedElsewhere({ isDefinedBy: 'http://purl.org/dc/terms/' }, foaf)).toBe(true);
      expect(isDefinedElsewhere({ uri: 'http://xmlns.com/wot/0.1/assurance' }, foaf)).toBe(true);
    });
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
