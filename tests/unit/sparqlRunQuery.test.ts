/**
 * Unit tests for running SPARQL over the editor's N3 store (spike for #169).
 * Calls runQuery directly on stores produced by parseRdfToGraph or built by hand, no UI involved.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Store, Parser, DataFactory, type Term } from 'n3';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/parser';
import { runQuery } from '../../src/sparql/runQuery';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const PREFIXES =
  'PREFIX owl: <http://www.w3.org/2002/07/owl#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> PREFIX : <http://example.org/> ';
const TTL_PREFIXES =
  '@prefix : <http://example.org/> . @prefix owl: <http://www.w3.org/2002/07/owl#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> . ';

async function loadFixtureStore(name: string): Promise<Store> {
  const path = join(__dirname, '../fixtures', name);
  const { store } = await parseRdfToGraph(readFileSync(path, 'utf-8'), { path });
  return store;
}

function storeFromTurtle(body: string): Store {
  return new Store(new Parser().parse(TTL_PREFIXES + body));
}

function classIrisInStore(store: Store): string[] {
  return store
    .getQuads(null, DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode(OWL_CLASS), null)
    .filter((q) => q.subject.termType === 'NamedNode')
    .map((q) => q.subject.value)
    .sort();
}

async function bindingsOf(stores: Store[], query: string) {
  const result = await runQuery(stores, query);
  if (result.kind !== 'bindings') throw new Error(`expected bindings, got ${result.kind}`);
  return result;
}

describe('runQuery', () => {
  // The first query loads the engine (hundreds of modules) and sets up its actors, and the first parse loads
  // rdf-parse: keep those one-off costs out of the tests, which then measure the logic only.
  // Two hooks, so each job has its own deadline and a slow machine has to be twice as slow to fail the file.
  beforeAll(async () => {
    await runQuery([new Store()], 'ASK { ?s ?p ?o }');
  });
  beforeAll(async () => {
    await parseRdfToGraph(TTL_PREFIXES + ':A a owl:Class .', { contentType: 'text/turtle' });
  });

  it('SELECT returns the same classes as a direct store query', async () => {
    const store = await loadFixtureStore('aec_drawing_ontology.ttl');
    const expected = classIrisInStore(store);
    expect(expected.length).toBeGreaterThan(0);

    const result = await bindingsOf([store], `${PREFIXES} SELECT DISTINCT ?c WHERE { ?c a owl:Class . FILTER(isIRI(?c)) }`);

    expect(result.variables).toEqual(['c']);
    expect(result.rows.map((r) => r.c.value).sort()).toEqual(expected);
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

    const result = await bindingsOf([tbox, abox], `${PREFIXES} SELECT ?i WHERE { ?c a owl:Class . ?i a ?c }`);
    expect(result.rows.map((r) => r.i.value)).toEqual(['http://example.org/alice']);
  });

  describe('the SPARQL features the editor relies on', () => {
    const store = storeFromTurtle(
      ':Person a owl:Class . :Student a owl:Class ; rdfs:subClassOf :Person . :PhD a owl:Class ; rdfs:subClassOf :Student ; rdfs:label "Doctoral" .'
    );

    it('supports property paths', async () => {
      const result = await bindingsOf([store], `${PREFIXES} SELECT ?c WHERE { ?c rdfs:subClassOf+ :Person }`);
      expect(result.rows.map((r) => r.c.value).sort()).toEqual(['http://example.org/PhD', 'http://example.org/Student']);
    });

    it('supports aggregates with GROUP BY', async () => {
      const result = await bindingsOf([store], `${PREFIXES} SELECT ?p (COUNT(?c) AS ?n) WHERE { ?c rdfs:subClassOf ?p } GROUP BY ?p ORDER BY ?p`);
      expect(result.rows.map((r) => [r.p.value, r.n.value])).toEqual([
        ['http://example.org/Person', '1'],
        ['http://example.org/Student', '1'],
      ]);
    });

    it('supports FILTER with regex', async () => {
      const result = await bindingsOf([store], `${PREFIXES} SELECT ?c WHERE { ?c rdfs:label ?l FILTER regex(?l, "^Doc") }`);
      expect(result.rows.map((r) => r.c.value)).toEqual(['http://example.org/PhD']);
    });
  });

  describe('never reaches the network', () => {
    it('cannot be made to fetch a URL through SERVICE or FROM', async () => {
      const fetchSpy = vi.fn(() => Promise.reject(new Error('network access attempted')));
      vi.stubGlobal('fetch', fetchSpy);
      try {
        const store = storeFromTurtle(':A a owl:Class .');
        for (const query of [
          'SELECT * WHERE { SERVICE <http://example.org/sparql> { ?s ?p ?o } }',
          'SELECT * FROM <http://example.org/data.ttl> WHERE { ?s ?p ?o }',
        ]) {
          await runQuery([store], query).catch(() => undefined);
        }
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe('values keep their RDF kind (#170 review)', () => {
    it('returns IRIs, language-tagged literals and typed literals as RDF/JS terms', async () => {
      const store = storeFromTurtle(':A rdfs:label "A label"@en ; :n 5 .');
      const result = await bindingsOf([store], `${PREFIXES} SELECT ?s ?l ?n WHERE { ?s rdfs:label ?l ; :n ?n }`);

      const [row] = result.rows;
      expect(row.s).toMatchObject({ termType: 'NamedNode', value: 'http://example.org/A' });
      expect(row.l).toMatchObject({ termType: 'Literal', value: 'A label', language: 'en' });
      expect(row.n).toMatchObject({ termType: 'Literal', value: '5' });
      expect(row.n.termType === 'Literal' && row.n.datatype.value).toBe(`${XSD}integer`);
    });

    it('does not turn a boolean result into a plain string', async () => {
      const store = storeFromTurtle(':A rdfs:subClassOf [ a owl:Restriction ] .');
      const result = await bindingsOf([store], `${PREFIXES} SELECT (isBlank(?r) AS ?b) WHERE { :A rdfs:subClassOf ?r }`);
      const b = result.rows[0].b;
      expect(b.termType).toBe('Literal');
      expect(b.termType === 'Literal' && b.datatype.value).toBe(`${XSD}boolean`);
      expect(b.value).toBe('true');
    });
  });

  describe('blank nodes can be looked up in the store (#170 review)', () => {
    const restrictionTtl = ':A rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :p ; owl:someValuesFrom :B ] .';

    it('SELECT returns the store\'s own blank node, not a relabelled one', async () => {
      const store = storeFromTurtle(restrictionTtl);
      const result = await bindingsOf([store], `${PREFIXES} SELECT ?r WHERE { :A rdfs:subClassOf ?r FILTER(isBlank(?r)) }`);

      const r = result.rows[0].r;
      expect(r.termType).toBe('BlankNode');
      expect(store.getQuads(r as Term, null, null, null).length).toBeGreaterThan(0);
    });

    it('CONSTRUCT returns quads that are in the store', async () => {
      const store = storeFromTurtle(restrictionTtl);
      const result = await runQuery([store], `${PREFIXES} CONSTRUCT { :A rdfs:subClassOf ?r } WHERE { :A rdfs:subClassOf ?r }`);

      expect(result.kind).toBe('quads');
      if (result.kind !== 'quads') return;
      expect(result.quads).toHaveLength(1);
      const q = result.quads[0];
      expect(store.countQuads(q.subject, q.predicate, q.object, q.graph)).toBe(1);
    });

    it('maps each blank node back to the store it came from, whatever the order of the stores', async () => {
      const first = storeFromTurtle(':A rdfs:subClassOf [ a owl:Restriction ] .');
      const second = storeFromTurtle(':B rdfs:subClassOf [ a owl:Restriction ] .');

      for (const stores of [[first, second], [second, first]]) {
        const result = await bindingsOf(stores, `${PREFIXES} SELECT ?c ?r WHERE { ?c rdfs:subClassOf ?r FILTER(isBlank(?r)) }`);
        expect(result.rows).toHaveLength(2);
        for (const { c, r } of result.rows) {
          const owner = c.value === 'http://example.org/A' ? first : second;
          expect(owner.getQuads(r as Term, null, null, null).length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('read-only (#170 review)', () => {
    it('rejects an update query and leaves the store unchanged', async () => {
      const store = await loadFixtureStore('aec_drawing_ontology.ttl');
      const before = store.size;
      await expect(
        runQuery([store], 'INSERT DATA { <http://example.org/a> <http://example.org/b> <http://example.org/c> }')
      ).rejects.toThrow(/read-only/i);
      expect(store.size).toBe(before);
    });

    it('rejects every kind of update with the same message, over one store or several', async () => {
      const updates = [
        'DELETE WHERE { ?s ?p ?o }',
        'DELETE { ?s ?p ?o } INSERT { ?s ?p "x" } WHERE { ?s ?p ?o }',
        'CLEAR ALL',
        'LOAD <http://example.org/x>',
      ];
      const first = storeFromTurtle(':A a owl:Class .');
      const second = storeFromTurtle(':B a owl:Class .');
      const sizes = [first.size, second.size];

      for (const update of updates) {
        await expect(runQuery([first], update)).rejects.toThrow(/read-only/i);
        await expect(runQuery([first, second], update)).rejects.toThrow(/read-only/i);
      }
      expect([first.size, second.size]).toEqual(sizes);
    });

    it('rejects a malformed query with a readable error', async () => {
      await expect(runQuery([new Store()], 'SELECT WHERE {')).rejects.toThrow(/parse/i);
    });
  });
});
