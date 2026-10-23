/**
 * Unit tests for running SPARQL over the editor's N3 store (spike for #169).
 * Calls runQuery directly on a store produced by parseRdfToGraph, no UI involved.
 */
import { describe, it, expect } from 'vitest';
import { Store, DataFactory } from 'n3';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/parser';
import { runQuery } from '../../src/sparql/runQuery';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const PREFIXES = 'PREFIX owl: <http://www.w3.org/2002/07/owl#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> ';

async function loadFixtureStore(name: string): Promise<Store> {
  const path = join(__dirname, '../fixtures', name);
  const { store } = await parseRdfToGraph(readFileSync(path, 'utf-8'), { path });
  return store;
}

function classIrisInStore(store: Store): string[] {
  return store
    .getQuads(null, DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode(OWL_CLASS), null)
    .filter((q) => q.subject.termType === 'NamedNode')
    .map((q) => q.subject.value)
    .sort();
}

describe('runQuery', () => {
  it('SELECT returns the same classes as a direct store query', async () => {
    const store = await loadFixtureStore('aec_drawing_ontology.ttl');
    const expected = classIrisInStore(store);
    expect(expected.length).toBeGreaterThan(0);

    const result = await runQuery([store], `${PREFIXES} SELECT DISTINCT ?c WHERE { ?c a owl:Class . FILTER(isIRI(?c)) }`);

    expect(result.kind).toBe('bindings');
    if (result.kind !== 'bindings') return;
    expect(result.variables).toEqual(['c']);
    expect(result.rows.map((r) => r.c).sort()).toEqual(expected);
  });

  it('ASK returns a boolean', async () => {
    const store = await loadFixtureStore('aec_drawing_ontology.ttl');
    const yes = await runQuery([store], `${PREFIXES} ASK { ?c a owl:Class }`);
    const no = await runQuery([store], 'ASK { <http://example.org/none> a <http://example.org/None> }');
    expect(yes).toEqual({ kind: 'boolean', value: true });
    expect(no).toEqual({ kind: 'boolean', value: false });
  });

  it('CONSTRUCT returns quads', async () => {
    const store = await loadFixtureStore('aec_drawing_ontology.ttl');
    const result = await runQuery([store], `${PREFIXES} CONSTRUCT { ?c a owl:Class } WHERE { ?c a owl:Class . FILTER(isIRI(?c)) }`);
    expect(result.kind).toBe('quads');
    if (result.kind !== 'quads') return;
    expect(result.quads.length).toBeGreaterThan(0);
  });

  it('queries several stores as one dataset', async () => {
    const tbox = new Store();
    const abox = new Store();
    const ex = (s: string) => DataFactory.namedNode(`http://example.org/${s}`);
    tbox.addQuad(ex('Person'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode(OWL_CLASS));
    abox.addQuad(ex('alice'), DataFactory.namedNode(RDF_TYPE), ex('Person'));

    const result = await runQuery([tbox, abox], `${PREFIXES} SELECT ?i WHERE { ?c a owl:Class . ?i a ?c }`);
    expect(result.kind).toBe('bindings');
    if (result.kind !== 'bindings') return;
    expect(result.rows).toEqual([{ i: 'http://example.org/alice' }]);
  });

  it('rejects an update query and leaves the store unchanged', async () => {
    const store = await loadFixtureStore('aec_drawing_ontology.ttl');
    const before = store.size;
    await expect(
      runQuery([store], 'INSERT DATA { <http://example.org/a> <http://example.org/b> <http://example.org/c> }')
    ).rejects.toThrow(/read-only|update/i);
    expect(store.size).toBe(before);
  });

  it('rejects a malformed query with a readable error', async () => {
    const store = new Store();
    await expect(runQuery([store], 'SELECT WHERE {')).rejects.toThrow();
  });
});
