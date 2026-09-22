/**
 * Parser-level tests for https://github.com/alelom/OntoCanvas/issues/31.
 *
 * Creating a data property used to assert rdfs:domain owl:Thing unconditionally and a range the
 * user never chose, which made the typing-stub pattern impossible to author. A new property must
 * state only what it was given.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Store } from 'n3';
import { parseRdfToGraph, getDataProperties, addDataPropertyToStore } from '../../src/parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STUBS_FIXTURE = join(__dirname, '../fixtures/aec-provenance-typing-stubs.ttl');

const RDFS_NS = 'http://www.w3.org/2000/01/rdf-schema#';
const XSD_NS = 'http://www.w3.org/2001/XMLSchema#';
const OWL_NS = 'http://www.w3.org/2002/07/owl#';

async function storeOf(): Promise<Store> {
  const content = readFileSync(STUBS_FIXTURE, 'utf-8');
  const { store } = await parseRdfToGraph(content, { path: STUBS_FIXTURE });
  return store;
}

function predicatesOf(store: Store, uri: string): string[] {
  return store.getQuads(uri, null, null, null).map((q) => q.predicate.value);
}

function objectsOf(store: Store, uri: string, predicate: string): string[] {
  return store
    .getQuads(uri, null, null, null)
    .filter((q) => q.predicate.value === predicate)
    .map((q) => q.object.value);
}

describe('addDataPropertyToStore', () => {
  it('asserts neither domain nor range when no range is given', async () => {
    const store = await storeOf();

    const name = addDataPropertyToStore(store, 'silent property', null, 'silentProperty');
    expect(name).toBe('silentProperty');

    const created = getDataProperties(store).find((p) => p.name === 'silentProperty')!;
    expect(created).toBeDefined();
    const predicates = predicatesOf(store, created.uri!);
    expect(predicates).not.toContain(RDFS_NS + 'domain');
    expect(predicates).not.toContain(RDFS_NS + 'range');
  });

  it('treats an empty string range the same as no range', async () => {
    const store = await storeOf();

    addDataPropertyToStore(store, 'blank range', '', 'blankRange');

    const created = getDataProperties(store).find((p) => p.name === 'blankRange')!;
    expect(predicatesOf(store, created.uri!)).not.toContain(RDFS_NS + 'range');
  });

  it('never writes owl:Thing as a domain', async () => {
    const store = await storeOf();

    addDataPropertyToStore(store, 'typed property', XSD_NS + 'string', 'typedProperty');

    const created = getDataProperties(store).find((p) => p.name === 'typedProperty')!;
    expect(objectsOf(store, created.uri!, RDFS_NS + 'domain')).not.toContain(OWL_NS + 'Thing');
  });

  it('writes the range it was given, and still declares the property', async () => {
    const store = await storeOf();

    addDataPropertyToStore(store, 'typed property', XSD_NS + 'dateTime', 'typedProperty');

    const created = getDataProperties(store).find((p) => p.name === 'typedProperty')!;
    expect(objectsOf(store, created.uri!, RDFS_NS + 'range')).toEqual([XSD_NS + 'dateTime']);
    expect(objectsOf(store, created.uri!, RDFS_NS + 'label')).toEqual(['typed property']);
    expect(created.range).toBe(XSD_NS + 'dateTime');
  });

  it('produces a property the parser reads back as asserting nothing', async () => {
    const store = await storeOf();

    addDataPropertyToStore(store, 'silent property', null, 'silentProperty');

    const created = getDataProperties(store).find((p) => p.name === 'silentProperty')!;
    // The same shape the parser reports for prov:generatedAtTime in this fixture (#25).
    expect(created.range).toBeNull();
    expect(created.domains).toEqual([]);
    expect(created.hasGlobalDomain).toBe(false);
  });
});
