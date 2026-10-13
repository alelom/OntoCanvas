import { describe, it, expect } from 'vitest';
import { Parser, Store } from 'n3';
import { compareVersions, importPinning, readOntologyVersion, versionLabel, type OntologyVersion } from './ontologyVersion';

const ONTO = 'https://example.org/onto';
const version = (versionIri: string | null, versionInfo: string | null = null, ontologyIri = ONTO): OntologyVersion =>
  ({ ontologyIri, versionIri, versionInfo });
const store = (ttl: string): Store =>
  new Store(new Parser().parse(
    '@prefix owl: <http://www.w3.org/2002/07/owl#> . @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n' + ttl
  ));

describe('readOntologyVersion', () => {
  it('reads the ontology IRI, owl:versionIRI and owl:versionInfo', () => {
    expect(readOntologyVersion(store(`<${ONTO}> rdf:type owl:Ontology ; owl:versionIRI <${ONTO}/1.0.0> ; owl:versionInfo "1.0.0" .`)))
      .toEqual(version(`${ONTO}/1.0.0`, '1.0.0'));
  });

  it('gives nulls for what the ontology does not declare, and null without an ontology', () => {
    expect(readOntologyVersion(store(`<${ONTO}> rdf:type owl:Ontology .`))).toEqual(version(null));
    expect(readOntologyVersion(store('<http://example.org/o#A> rdf:type owl:Class .'))).toBeNull();
  });
});

describe('versionLabel (#130)', () => {
  it('is owl:versionInfo when declared', () => {
    expect(versionLabel(version(`${ONTO}/1.0.0`, '2.0.0-merged'))).toBe('2.0.0-merged');
  });

  it('is the last part of owl:versionIRI when it is a version number and there is no owl:versionInfo', () => {
    expect(versionLabel(version(`${ONTO}/1.2.0`))).toBe('1.2.0');
    expect(versionLabel(version(`${ONTO}/1.2.0/`))).toBe('1.2.0');
    expect(versionLabel(version(`${ONTO}/releases/latest-draft`))).toBeNull();
  });

  it('is null when nothing is declared', () => {
    expect(versionLabel(version(null))).toBeNull();
    expect(versionLabel(null)).toBeNull();
  });
});

describe('importPinning (#131)', () => {
  it('is "pinned" when the import IRI is the imported ontology\'s owl:versionIRI', () => {
    expect(importPinning(`${ONTO}/1.0.0`, version(`${ONTO}/1.0.0`))).toBe('pinned');
    expect(importPinning(`${ONTO}/1.0.0/`, version(`${ONTO}/1.0.0`))).toBe('pinned');
  });

  it('is "latest" when the import IRI is the imported ontology\'s own IRI', () => {
    expect(importPinning(ONTO, version(`${ONTO}/1.0.0`))).toBe('latest');
    expect(importPinning(`${ONTO}#`, version(`${ONTO}/1.0.0`, null, `${ONTO}#`))).toBe('latest');
  });

  it('is "unknown" when it is neither, or the import was not read', () => {
    expect(importPinning('https://cdn.example.org/onto.ttl', version(`${ONTO}/1.0.0`))).toBe('unknown');
    expect(importPinning(ONTO, null)).toBe('unknown');
  });
});

describe('compareVersions (#132)', () => {
  it('orders version numbers numerically, part by part', () => {
    expect(compareVersions('1.10.0', '1.9.3')).toBeGreaterThan(0);
    expect(compareVersions('v2.0', '2.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
  });

  it('puts a pre-release before its release', () => {
    expect(compareVersions('2.0.0-rc.1', '2.0.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0-rc.2', '2.0.0-rc.1')).toBeGreaterThan(0);
  });

  it('is null when either is not a version number', () => {
    expect(compareVersions('latest-draft', '1.0.0')).toBeNull();
  });
});
