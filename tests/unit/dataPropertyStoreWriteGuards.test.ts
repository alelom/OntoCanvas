/**
 * Store writers must not invent a subject.
 *
 * updateDataPropertyRangeInStore resolves a property name to a URI, and getDataPropertyUriFromStore
 * falls back to BASE_IRI + name when the name is unknown. Without an existence check the writer
 * happily asserts rdfs:range on that made-up subject, which then lands in the saved Turtle, and its
 * return value stops telling callers whether the property was there at all.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph, updateDataPropertyRangeInStore } from '../../src/parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '../fixtures/restriction-on-data-range.ttl');

const XSD_INTEGER = 'http://www.w3.org/2001/XMLSchema#integer';
const RDFS_RANGE = 'http://www.w3.org/2000/01/rdf-schema#range';

async function load() {
  const { store } = await parseRdfToGraph(readFileSync(FIXTURE, 'utf-8'), { path: FIXTURE });
  return store!;
}

describe('updateDataPropertyRangeInStore', () => {
  it('reports failure and writes nothing for a property the store does not have', async () => {
    const store = await load();
    const before = store.getQuads(null, RDFS_RANGE, null, null).length;

    expect(updateDataPropertyRangeInStore(store, 'notAProperty', XSD_INTEGER)).toBe(false);

    expect(store.getQuads(null, RDFS_RANGE, null, null).length).toBe(before);
    expect(
      store.getQuads(null, null, null, null).some((q) => q.subject.value.endsWith('#notAProperty'))
    ).toBe(false);
  });

  it('adds a range to a property that has none', async () => {
    const store = await load();
    expect(updateDataPropertyRangeInStore(store, 'createdDate', XSD_INTEGER)).toBe(true);

    const ranges = store.getQuads(null, RDFS_RANGE, null, null);
    expect(ranges.some((q) => q.subject.value.endsWith('#createdDate') && q.object.value === XSD_INTEGER)).toBe(true);
  });

  it('removes the range when asked to assert none', async () => {
    const store = await load();
    updateDataPropertyRangeInStore(store, 'createdDate', XSD_INTEGER);

    expect(updateDataPropertyRangeInStore(store, 'createdDate', null)).toBe(true);
    expect(
      store.getQuads(null, RDFS_RANGE, null, null).some((q) => q.subject.value.endsWith('#createdDate'))
    ).toBe(false);
  });
});
