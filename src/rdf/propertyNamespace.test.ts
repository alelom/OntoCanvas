import { describe, it, expect } from 'vitest';
import { isExternalPropertyUri } from './propertyNamespace';

const DEFAULT = 'http://example.org/aec-drawing-ontology#';

describe('isExternalPropertyUri (#87)', () => {
  it("is local when the property is in the ontology's namespace", () => {
    expect(isExternalPropertyUri('http://example.org/other#linksTo', 'http://example.org/other#', DEFAULT)).toBe(false);
    // getMainOntologyBase can return `<ontology subject>#`, e.g. for an ontology named :Ontology.
    expect(isExternalPropertyUri('http://example.org/aec-drawing-ontology#contains', 'http://example.org/aec-drawing-ontology#Ontology#', DEFAULT)).toBe(false);
  });

  it('is external when the property is in another namespace', () => {
    expect(isExternalPropertyUri('http://example.org/ext#uses', 'http://example.org/main#', DEFAULT)).toBe(true);
  });

  it('falls back to the default base when the store declares no ontology', () => {
    expect(isExternalPropertyUri(`${DEFAULT}contains`, null, DEFAULT)).toBe(false);
    expect(isExternalPropertyUri('http://example.org/ext#uses', null, DEFAULT)).toBe(true);
  });

  it('keeps properties of a slash ontology such as FOAF on their full IRI, as before', () => {
    // Unchanged by #87: the namespace is compared without its trailing slash. Search shows them by
    // prefixed name (foaf:member), which relies on the full IRI.
    expect(isExternalPropertyUri('http://xmlns.com/foaf/0.1/member', 'http://xmlns.com/foaf/0.1/#', DEFAULT)).toBe(true);
  });
});
