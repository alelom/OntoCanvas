/**
 * The name and prefix of the open ontology, shown in the bottom bar (#113): the name is its rdfs:label, else
 * dcterms:title / dc:title, else a short name from its IRI; the prefix is the one the file declares for the
 * ontology's own namespace, when there is one.
 */
import { describe, it, expect } from 'vitest';
import { loadOntologyFromContent } from '../../src/lib/loadOntology';
import { getOntologyInfo, formatOntologyInfo } from '../../src/ui/ontologyInfo';

const PREFIXES = `@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix dc: <http://purl.org/dc/elements/1.1/> .
`;

async function info(ttl: string) {
  const { parseResult, prefixMap } = await loadOntologyFromContent(PREFIXES + ttl, 'test.ttl');
  return getOntologyInfo(parseResult.store, prefixMap);
}

describe('getOntologyInfo', () => {
  it('uses the ontology label and the prefix the file declares for its namespace', async () => {
    expect(
      await info(`@prefix foaf: <http://xmlns.com/foaf/0.1/> .
<http://xmlns.com/foaf/0.1/> a owl:Ontology ; rdfs:label "Friend of a Friend vocabulary" .`)
    ).toEqual({ iri: 'http://xmlns.com/foaf/0.1/', name: 'Friend of a Friend vocabulary', prefix: 'foaf' });
  });

  it('matches the prefix whether or not the IRI and the namespace end in # or /', async () => {
    const withHash = await info(`@prefix ex: <http://example.org/onto#> .
<http://example.org/onto> a owl:Ontology ; rdfs:label "Onto" .`);
    expect(withHash?.prefix).toBe('ex');
  });

  it('falls back to dcterms:title, then dc:title, then a name from the IRI', async () => {
    expect((await info('<http://example.org/a> a owl:Ontology ; dcterms:title "From dcterms" .'))?.name).toBe('From dcterms');
    expect((await info('<http://example.org/a> a owl:Ontology ; dc:title "From dc" .'))?.name).toBe('From dc');
    expect((await info('<http://example.org/some-ontology> a owl:Ontology .'))?.name).toBe('some-ontology');
  });

  it('prefers rdfs:label over the titles', async () => {
    expect((await info('<http://example.org/a> a owl:Ontology ; dcterms:title "Title" ; rdfs:label "Label" .'))?.name).toBe('Label');
  });

  it('has no prefix when the file declares none for the ontology, or only the default one', async () => {
    expect((await info('<http://example.org/a> a owl:Ontology ; rdfs:label "A" .'))?.prefix).toBeNull();
    expect(
      (await info(`@prefix : <http://example.org/a#> .
<http://example.org/a> a owl:Ontology ; rdfs:label "A" .`))?.prefix
    ).toBeNull();
  });

  it('is null when the file declares no ontology', async () => {
    expect(await info('<http://example.org/x> a owl:Class .')).toBeNull();
  });
});

describe('formatOntologyInfo', () => {
  it('shows the name with the prefix, as written in the file, in brackets', () => {
    expect(formatOntologyInfo({ iri: 'http://xmlns.com/foaf/0.1/', name: 'FOAF', prefix: 'foaf' })).toBe('FOAF (foaf:)');
  });
  it('shows only the name without a prefix', () => {
    expect(formatOntologyInfo({ iri: 'http://example.org/a', name: 'A', prefix: null })).toBe('A');
  });
});
