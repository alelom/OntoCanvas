/**
 * The history of the queries run on a file (#182): what is recorded, how much is kept, where it is kept, and what happens when
 * the browser's storage is missing or fails. Pure logic and the storage adapter; the selector is in queryTabHistory.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { Store, DataFactory } from 'n3';
import {
  HISTORY_FILES,
  HISTORY_LIMIT,
  addToHistory,
  historyKeyOf,
  historyLabel,
  localStorageHistory,
  type HistoryEntry,
} from '../../src/sparql/queryHistory';

const { namedNode, quad } = DataFactory;
const RDF_TYPE = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
const OWL_ONTOLOGY = namedNode('http://www.w3.org/2002/07/owl#Ontology');

/** A stand-in for window.localStorage. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('addToHistory', () => {
  it('puts the newest query first', () => {
    let entries: HistoryEntry[] = [];
    entries = addToHistory(entries, 'ASK { ?s ?p ?o }', 1);
    entries = addToHistory(entries, 'SELECT * WHERE { ?s ?p ?o }', 2);

    expect(entries.map((e) => e.query)).toEqual(['SELECT * WHERE { ?s ?p ?o }', 'ASK { ?s ?p ?o }']);
    expect(entries[0].at).toBe(2);
  });

  it('skips a repeat of the query run last, but records the same text again after another one', () => {
    let entries = addToHistory([], 'ASK {}', 1);
    entries = addToHistory(entries, 'ASK {}', 2);
    expect(entries).toHaveLength(1);
    expect(entries[0].at).toBe(1);

    entries = addToHistory(entries, 'ASK { ?s ?p ?o }', 3);
    entries = addToHistory(entries, 'ASK {}', 4);
    expect(entries.map((e) => e.query)).toEqual(['ASK {}', 'ASK { ?s ?p ?o }', 'ASK {}']);
  });

  it('does not record a blank query', () => {
    expect(addToHistory([], '   \n\t', 1)).toEqual([]);
    expect(addToHistory([], '', 1)).toEqual([]);
  });

  it(`keeps the last ${HISTORY_LIMIT}, dropping the oldest`, () => {
    let entries: HistoryEntry[] = [];
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) entries = addToHistory(entries, `ASK { ?s ?p "${i}" }`, i);

    expect(entries).toHaveLength(HISTORY_LIMIT);
    expect(entries[0].query).toBe(`ASK { ?s ?p "${HISTORY_LIMIT + 5}" }`);
    expect(entries.at(-1)!.query).toBe('ASK { ?s ?p "6" }');
  });

  it('does not change the list it is given', () => {
    const before: HistoryEntry[] = [{ query: 'ASK {}', at: 1 }];
    addToHistory(before, 'ASK { ?s ?p ?o }', 2);
    expect(before).toEqual([{ query: 'ASK {}', at: 1 }]);
  });
});

describe('localStorageHistory', () => {
  it('keeps the queries of a file for the next visit', () => {
    const storage = memoryStorage();
    localStorageHistory(storage).save('ontology:http://example.org/o', [{ query: 'ASK {}', at: 5 }]);

    expect(localStorageHistory(storage).load('ontology:http://example.org/o')).toEqual([{ query: 'ASK {}', at: 5 }]);
  });

  it('keeps each file apart', () => {
    const history = localStorageHistory(memoryStorage());
    history.save('a', [{ query: 'ASK { <http://a> ?p ?o }', at: 1 }]);
    history.save('b', [{ query: 'ASK { <http://b> ?p ?o }', at: 2 }]);

    expect(history.load('a').map((e) => e.query)).toEqual(['ASK { <http://a> ?p ?o }']);
    expect(history.load('b').map((e) => e.query)).toEqual(['ASK { <http://b> ?p ?o }']);
    expect(history.load('c')).toEqual([]);
  });

  it('clears the history of one file and leaves the others', () => {
    const storage = memoryStorage();
    const history = localStorageHistory(storage);
    history.save('a', [{ query: 'ASK {}', at: 1 }]);
    history.save('b', [{ query: 'ASK { ?s ?p ?o }', at: 2 }]);

    history.clear('a');

    expect(history.load('a')).toEqual([]);
    expect(history.load('b')).toHaveLength(1);
  });

  it(`keeps the history of at most ${HISTORY_FILES} files, forgetting the one used longest ago`, () => {
    const history = localStorageHistory(memoryStorage());
    const realNow = Date.now;
    let clock = 1_000;
    Date.now = () => clock++;
    try {
      for (let i = 0; i < HISTORY_FILES + 3; i++) history.save(`file-${i}`, [{ query: `ASK { <http://x/${i}> ?p ?o }`, at: i }]);
    } finally {
      Date.now = realNow;
    }

    expect(history.load('file-0')).toEqual([]);
    expect(history.load('file-2')).toEqual([]);
    expect(history.load('file-3')).toHaveLength(1);
    expect(history.load(`file-${HISTORY_FILES + 2}`)).toHaveLength(1);
  });

  it('never keeps more than the limit for a file, whatever it is given', () => {
    const history = localStorageHistory(memoryStorage());
    const many = Array.from({ length: HISTORY_LIMIT + 10 }, (_, i) => ({ query: `ASK { ?s ?p "${i}" }`, at: i }));

    history.save('a', many);

    expect(history.load('a')).toHaveLength(HISTORY_LIMIT);
  });

  it('reads nothing from stored text it cannot use, instead of failing', () => {
    for (const stored of ['{ not json', 'null', '[]', '{"files":5}', '{"files":{"a":{"entries":"no"}}}', '{"files":{"a":{"at":1,"entries":[{"query":5},{"query":"ASK {}","at":2},null]}}}']) {
      const history = localStorageHistory(memoryStorage({ 'ontocanvas.sparqlHistory.v1': stored }));
      expect(() => history.load('a'), stored).not.toThrow();
    }
    const partial = localStorageHistory(memoryStorage({ 'ontocanvas.sparqlHistory.v1': '{"files":{"a":{"at":1,"entries":[{"query":5},{"query":"ASK {}","at":2},null]}}}' }));
    expect(partial.load('a')).toEqual([{ query: 'ASK {}', at: 2 }]);
  });

  it('does not throw when the storage refuses to read or to write (a private window, blocked site data, a full disk)', () => {
    const broken = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    const history = localStorageHistory(broken);

    expect(history.load('a')).toEqual([]);
    expect(() => history.save('a', [{ query: 'ASK {}', at: 1 }])).not.toThrow();
    expect(() => history.clear('a')).not.toThrow();
  });

  it('does nothing when there is no storage at all', () => {
    const history = localStorageHistory(null);

    expect(history.load('a')).toEqual([]);
    expect(() => history.save('a', [{ query: 'ASK {}', at: 1 }])).not.toThrow();
  });
});

describe('historyKeyOf', () => {
  const ontologyStore = (iri: string) => new Store([quad(namedNode(iri), RDF_TYPE, OWL_ONTOLOGY)]);

  it("is the ontology's own IRI, so the same ontology opened from another place has the same history", () => {
    expect(historyKeyOf(ontologyStore('http://example.org/onto'), 'a.ttl')).toBe('ontology:http://example.org/onto');
    expect(historyKeyOf(ontologyStore('http://example.org/onto'), 'https://elsewhere.org/b.ttl')).toBe('ontology:http://example.org/onto');
  });

  it('falls back to the name of the file when the ontology declares no IRI', () => {
    expect(historyKeyOf(new Store(), 'onto.ttl')).toBe('file:onto.ttl');
  });

  it('is null, so nothing is recorded, when there is neither a store nor a file name', () => {
    expect(historyKeyOf(null, 'onto.ttl')).toBe('file:onto.ttl');
    expect(historyKeyOf(new Store(), null)).toBeNull();
    expect(historyKeyOf(null, null)).toBeNull();
  });
});

describe('historyLabel', () => {
  const at = new Date(2026, 9, 28, 14, 5).getTime();
  const sameDay = new Date(2026, 9, 28, 18, 0).getTime();
  const nextWeek = new Date(2026, 10, 4, 9, 0).getTime();

  it('shows the time of day for a query run today, with the first line that is not a PREFIX line', () => {
    const label = historyLabel({ query: 'PREFIX : <http://example.org/>\nPREFIX owl: <http://www.w3.org/2002/07/owl#>\n\nSELECT ?c WHERE { ?c a owl:Class }', at }, sameDay, 'en-GB');

    expect(label).toBe('14:05  SELECT ?c WHERE { ?c a owl:Class }');
  });

  it('shows the date for an older query', () => {
    expect(historyLabel({ query: 'ASK {}', at }, nextWeek, 'en-GB')).toBe('28 Oct, 14:05  ASK {}');
  });

  it('skips comments and BASE lines too, collapses spaces, and shortens a long line', () => {
    const long = `SELECT ?a WHERE { ${'?a ?b ?c . '.repeat(20)}}`;
    const label = historyLabel({ query: `# a note\nBASE <http://x/>\n   ${long}`, at }, sameDay, 'en-GB');

    expect(label.startsWith('14:05  SELECT ?a WHERE { ?a ?b ?c . ?a ?b ?c .')).toBe(true);
    expect(label.endsWith('…')).toBe(true);
    expect(label.length).toBeLessThanOrEqual('14:05  '.length + 61);
  });

  it('skips the PREFIX and BASE declarations of a query written on a single line, or several to a line', () => {
    const oneLine = 'PREFIX : <http://example.org/o#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> SELECT ?c ?l WHERE { ?c rdfs:label ?l } ORDER BY ?c';
    expect(historyLabel({ query: oneLine, at }, sameDay, 'en-GB')).toBe('14:05  SELECT ?c ?l WHERE { ?c rdfs:label ?l } ORDER BY ?c');

    const mixed = '# which classes\nBASE <http://x/> PREFIX : <http://example.org/o#>\nprefix owl: <http://www.w3.org/2002/07/owl#> ASK { :a a owl:Class }';
    expect(historyLabel({ query: mixed, at }, sameDay, 'en-GB')).toBe('14:05  ASK { :a a owl:Class }');
  });

  it('uses the first line when the query is nothing but PREFIX lines', () => {
    expect(historyLabel({ query: 'PREFIX : <http://example.org/>', at }, sameDay, 'en-GB')).toBe('14:05  PREFIX : <http://example.org/>');
  });
});
