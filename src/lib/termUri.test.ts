import { describe, it, expect } from 'vitest';
import { resolveNodeTerm, resolveEdgeTerm, buildTermLink, type TermLookup } from './termUri';

const NS = 'https://w3id.org/adiro/aec_drawing_metadata#';

const lookup: TermLookup = {
  nodes: [
    { id: 'Titleblock', label: 'Title Block', labellableRoot: null, uri: `${NS}Titleblock` },
    { id: 'NoUri', label: 'No Uri', labellableRoot: null },
  ],
  objectProperties: [
    { name: 'hasField', label: 'has field', hasCardinality: false, uri: `${NS}hasField` },
    { name: 'hasGeometry', label: 'has geometry', hasCardinality: false, uri: 'http://www.opengis.net/ont/geosparql#hasGeometry' },
  ],
  dataProperties: [
    { name: 'sheetNumber', label: 'sheet number', range: null, domains: [], hasGlobalDomain: false, uri: `${NS}sheetNumber` },
  ],
};

describe('resolveNodeTerm', () => {
  it('returns the class URI and label for a class node', () => {
    expect(resolveNodeTerm('Titleblock', lookup)).toEqual({ uri: `${NS}Titleblock`, label: 'Title Block' });
  });

  it('returns a null URI when the class has none recorded', () => {
    expect(resolveNodeTerm('NoUri', lookup)).toEqual({ uri: null, label: 'No Uri' });
  });

  it('resolves a data property node to the data property URI', () => {
    expect(resolveNodeTerm('__dataprop__Titleblock__sheetNumber', lookup)).toEqual({
      uri: `${NS}sheetNumber`,
      label: 'sheet number',
    });
  });

  it('resolves a data property restriction node to the data property URI', () => {
    expect(resolveNodeTerm('__dataproprestrict__Titleblock__sheetNumber', lookup)?.uri).toBe(`${NS}sheetNumber`);
  });

  it('returns null for an unknown node', () => {
    expect(resolveNodeTerm('Missing', lookup)).toBeNull();
  });
});

describe('resolveEdgeTerm', () => {
  it('resolves an object property edge by local name', () => {
    expect(resolveEdgeTerm('Titleblock->NoUri:hasField', lookup)).toEqual({ uri: `${NS}hasField`, label: 'has field' });
  });

  it('resolves an object property edge whose type is a full URI', () => {
    const id = 'Titleblock->NoUri:http://www.opengis.net/ont/geosparql#hasGeometry';
    expect(resolveEdgeTerm(id, lookup)).toEqual({
      uri: 'http://www.opengis.net/ont/geosparql#hasGeometry',
      label: 'has geometry',
    });
  });

  it('keeps an unknown full-URI edge type as its own URI', () => {
    const id = 'A->B:http://example.org/x#rel';
    expect(resolveEdgeTerm(id, lookup)).toEqual({ uri: 'http://example.org/x#rel', label: 'rel' });
  });

  it('resolves subClassOf to rdfs:subClassOf', () => {
    expect(resolveEdgeTerm('A->B:subClassOf', lookup)).toEqual({
      uri: 'http://www.w3.org/2000/01/rdf-schema#subClassOf',
      label: 'subClassOf',
    });
  });

  it('resolves a data property edge through its data property node', () => {
    expect(resolveEdgeTerm('Titleblock->__dataprop__Titleblock__sheetNumber:dataprop', lookup)).toEqual({
      uri: `${NS}sheetNumber`,
      label: 'sheet number',
    });
  });

  it('returns null for a malformed edge id', () => {
    expect(resolveEdgeTerm('not-an-edge', lookup)).toBeNull();
  });
});

describe('buildTermLink', () => {
  const ttl = 'https://w3id.org/adiro/aec_drawing_metadata.ttl';

  it('points at the loaded TTL with the term fragment for a term of the main ontology', () => {
    expect(buildTermLink(`${NS}Titleblock`, ttl, [NS])).toBe(`${ttl}#Titleblock`);
  });

  it('replaces any fragment already on the loaded URL', () => {
    expect(buildTermLink(`${NS}Titleblock`, `${ttl}#Other`, [NS])).toBe(`${ttl}#Titleblock`);
  });

  it('falls back to the term URI for a term outside the main ontology', () => {
    const geo = 'http://www.opengis.net/ont/geosparql#hasGeometry';
    expect(buildTermLink(geo, ttl, [NS])).toBe(geo);
  });

  it('falls back to the term URI when the ontology was loaded from a local file', () => {
    expect(buildTermLink(`${NS}Titleblock`, 'aec_drawing_metadata.ttl', [NS])).toBe(`${NS}Titleblock`);
  });

  it('returns null when the term URI is not dereferenceable and there is no loaded URL', () => {
    expect(buildTermLink('urn:x:Thing', null, [])).toBeNull();
    expect(buildTermLink(null, ttl, [NS])).toBeNull();
  });
});
