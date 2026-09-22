/**
 * Parser-level tests for https://github.com/alelom/OntoCanvas/issues/26.
 *
 * The object-property write paths used to fill a blank domain or range field with owl:Thing.
 * That is not the same claim as asserting nothing: it puts a statement in the saved file that
 * the author never made, and it erases a deliberate typing stub on the first save. These tests
 * pin both directions - a blank field writes nothing, and a deliberate owl:Thing survives.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Store } from 'n3';
import {
  parseRdfToGraph,
  getObjectProperties,
  addObjectPropertyToStore,
  updateObjectPropertyDomainRangeInStore,
} from '../../src/parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STUBS_FIXTURE = join(__dirname, '../fixtures/aec-provenance-typing-stubs.ttl');

const RDFS_NS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL_THING = 'http://www.w3.org/2002/07/owl#Thing';

async function storeOf(fixture: string): Promise<Store> {
  const content = readFileSync(fixture, 'utf-8');
  const { store } = await parseRdfToGraph(content, { path: fixture });
  return store;
}

function domainRangeOf(store: Store, uri: string): { domains: string[]; ranges: string[] } {
  const quads = store.getQuads(uri, null, null, null);
  return {
    domains: quads.filter((q) => q.predicate.value === RDFS_NS + 'domain').map((q) => q.object.value),
    ranges: quads.filter((q) => q.predicate.value === RDFS_NS + 'range').map((q) => q.object.value),
  };
}

const INFERRED_BY = 'https://w3id.org/adiro/aec_provenance#inferredBy';

describe('updateObjectPropertyDomainRangeInStore', () => {
  it('removes the assertion when a field is cleared, rather than writing owl:Thing', async () => {
    const store = await storeOf(STUBS_FIXTURE);
    expect(domainRangeOf(store, INFERRED_BY)).toEqual({
      domains: ['https://w3id.org/adiro/aec_provenance#InferenceMeta'],
      ranges: ['http://www.w3.org/ns/prov#Agent'],
    });

    updateObjectPropertyDomainRangeInStore(store, 'inferredBy', null, null);

    expect(domainRangeOf(store, INFERRED_BY)).toEqual({ domains: [], ranges: [] });
  });

  it('writes owl:Thing only when the user names it deliberately', async () => {
    const store = await storeOf(STUBS_FIXTURE);

    updateObjectPropertyDomainRangeInStore(store, 'inferredBy', 'owl:Thing', 'Thing');

    expect(domainRangeOf(store, INFERRED_BY)).toEqual({
      domains: [OWL_THING],
      ranges: [OWL_THING],
    });
  });

  it('leaves an asserted side alone when only the other side is cleared', async () => {
    const store = await storeOf(STUBS_FIXTURE);

    updateObjectPropertyDomainRangeInStore(store, 'inferredBy', 'InferenceMeta', null);

    const { domains, ranges } = domainRangeOf(store, INFERRED_BY);
    expect(domains).toEqual(['https://w3id.org/adiro/aec_provenance#InferenceMeta']);
    expect(ranges).toEqual([]);
  });
});

describe('addObjectPropertyToStore', () => {
  it('asserts no domain or range when neither was given', async () => {
    const store = await storeOf(STUBS_FIXTURE);

    addObjectPropertyToStore(store, 'brand new', true, 'brandNew');

    const created = getObjectProperties(store).find((p) => p.uri?.endsWith('#brandNew'));
    expect(created).toBeDefined();
    const { domains, ranges } = domainRangeOf(store, created!.uri!);
    expect(domains).toEqual([]);
    expect(ranges).toEqual([]);
  });

  it('writes the domain and range that were given', async () => {
    const store = await storeOf(STUBS_FIXTURE);

    addObjectPropertyToStore(store, 'with types', true, 'withTypes', {
      domain: 'InferenceMeta',
      range: 'FieldAssertion',
    });

    const created = getObjectProperties(store).find((p) => p.uri?.endsWith('#withTypes'));
    const { domains, ranges } = domainRangeOf(store, created!.uri!);
    expect(domains).toEqual(['https://w3id.org/adiro/aec_provenance#InferenceMeta']);
    expect(ranges).toEqual(['https://w3id.org/adiro/aec_provenance#FieldAssertion']);
  });
});

describe('getObjectProperties', () => {
  it('distinguishes an asserted owl:Thing from no assertion at all', async () => {
    const ttl = `
@prefix : <http://example.org/g#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/g> rdf:type owl:Ontology .
:relates rdf:type owl:ObjectProperty ; rdfs:domain owl:Thing ; rdfs:range owl:Thing .
:silent rdf:type owl:ObjectProperty .
`;
    const { store } = await parseRdfToGraph(ttl, { path: 'g.ttl' });
    const props = getObjectProperties(store);

    const relates = props.find((p) => p.name === 'relates')!;
    expect(relates.hasGlobalDomain).toBe(true);
    expect(relates.hasGlobalRange).toBe(true);
    // The universal class is reported through the flags, never as a class name to display.
    expect(relates.domain ?? null).toBeNull();
    expect(relates.range ?? null).toBeNull();

    const silent = props.find((p) => p.name === 'silent')!;
    expect(silent.hasGlobalDomain).toBe(false);
    expect(silent.hasGlobalRange).toBe(false);
  });
});
