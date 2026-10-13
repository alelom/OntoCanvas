import { describe, it, expect } from 'vitest';
import { versionPinnedUri } from './versionPinnedUri';
import type { OntologyVersion } from './ontologyVersion';

const ONTO = 'https://w3id.org/adiro/aec_provenance';
const version = (versionIri: string | null, versionInfo: string | null = null, ontologyIri = ONTO): OntologyVersion =>
  ({ ontologyIri, versionIri, versionInfo });

describe('versionPinnedUri (#128)', () => {
  it('puts the version IRI in place of the ontology IRI, for hash and slash terms alike', () => {
    expect(versionPinnedUri(`${ONTO}#Agent`, version(`${ONTO}/1.0.0`))).toEqual({ uri: `${ONTO}/1.0.0#Agent`, version: '1.0.0', derived: false });
    expect(versionPinnedUri('http://example.org/onto/Wall', version('http://example.org/onto/2.1/', null, 'http://example.org/onto/')))
      .toEqual({ uri: 'http://example.org/onto/2.1/Wall', version: '2.1', derived: false });
  });

  it('accepts an ontology IRI written with its trailing `#`', () => {
    expect(versionPinnedUri('http://example.org/o#A', version('http://example.org/o/3', null, 'http://example.org/o#')))
      .toEqual({ uri: 'http://example.org/o/3#A', version: '3', derived: false });
  });

  it('derives the version IRI from owl:versionInfo when there is no owl:versionIRI, and says so', () => {
    expect(versionPinnedUri(`${ONTO}#Agent`, version(null, '1.2.0'))).toEqual({ uri: `${ONTO}/1.2.0#Agent`, version: '1.2.0', derived: true });
    expect(versionPinnedUri(`${ONTO}#Agent`, version(null, 'v2.0.0-rc.1'))).toEqual({ uri: `${ONTO}/v2.0.0-rc.1#Agent`, version: 'v2.0.0-rc.1', derived: true });
  });

  it('prefers owl:versionIRI over owl:versionInfo', () => {
    expect(versionPinnedUri(`${ONTO}#Agent`, version(`${ONTO}/1.0.0`, '2.0.0-merged'))).toEqual({ uri: `${ONTO}/1.0.0#Agent`, version: '1.0.0', derived: false });
  });

  it('has no pinned URI when the ontology gives no usable version', () => {
    expect(versionPinnedUri(`${ONTO}#Agent`, version(null)).uri).toBeNull();
    expect(versionPinnedUri(`${ONTO}#Agent`, version(null, 'Release of March 2020')).uri).toBeNull();
    expect(versionPinnedUri(`${ONTO}#Agent`, null).uri).toBeNull();
  });

  it('has no pinned URI for a term outside the ontology (an import, rdfs:subClassOf) or without a URI', () => {
    expect(versionPinnedUri('http://www.w3.org/2000/01/rdf-schema#subClassOf', version(`${ONTO}/1.0.0`)).uri).toBeNull();
    expect(versionPinnedUri(`${ONTO}_extra#Agent`, version(`${ONTO}/1.0.0`)).uri).toBeNull();
    expect(versionPinnedUri(null, version(`${ONTO}/1.0.0`)).uri).toBeNull();
  });

  it('explains why there is no pinned URI', () => {
    const reason = (r: ReturnType<typeof versionPinnedUri>): string => ('reason' in r ? r.reason : '');
    expect(reason(versionPinnedUri(`${ONTO}#Agent`, version(null)))).toMatch(/owl:versionIRI/);
    expect(reason(versionPinnedUri('http://other.org/x#A', version(`${ONTO}/1.0.0`)))).toContain(ONTO);
  });
});
