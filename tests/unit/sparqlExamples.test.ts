/**
 * The SPARQL panel example (#171) must keep giving what its header comment promises.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Store, Term } from 'n3';
import { parseRdfToGraph } from '../../src/ontology/buildGraph';
import { runQuery } from '../../src/sparql/runQuery';
import { prefixHeader, withStandardPrefixes } from '../../src/sparql/prefixHeader';
import { describeResult, type ResultView } from '../../src/sparql/resultView';
import { irisInTable, matchIrisToGraph } from '../../src/sparql/graphMatches';
import { detectInstanceData } from '../../src/ui/ontologyIssues';
import { INDIVIDUALS_STARTER_QUERY } from '../../src/ui/sidePanel/queryTab';

const EXAMPLE = join(dirname(fileURLToPath(import.meta.url)), '../../examples/sparql/query-panel.ttl');
const text = readFileSync(EXAMPLE, 'utf-8');
let store: Store;
let declared: Record<string, string>;
let HEADER: string;
const select = async (query: string) => {
  const result = await runQuery([store], `${HEADER}\n${query}`);
  if (result.kind !== 'bindings') throw new Error(`expected bindings, got ${result.kind}`);
  return result;
};
const shown = async (query: string) => {
  const view = await describeResult(await runQuery([store], `${HEADER}\n${query}`), withStandardPrefixes(declared));
  if (view.kind !== 'table') throw new Error(`expected a table, got ${view.kind}`);
  return view.rows.map((row) => row.map((cell) => cell?.text));
};

describe('examples/sparql/query-panel.ttl', () => {
  // The engine and the parser are loaded before this file runs, by tests/engineSetup.ts (#192).
  beforeAll(async () => {
    const parsed = await parseRdfToGraph(text, { path: EXAMPLE });
    store = parsed.store;
    declared = parsed.prefixes ?? {};
    HEADER = prefixHeader(declared);
  });

  it('declares the default prefix, so the panel\'s starting query can use it', () => {
    expect(HEADER).toContain('PREFIX : <http://example.org/examples/sparql-queries#>');
  });

  it('a property path finds the subclasses at any depth', async () => {
    expect(await shown('SELECT ?c WHERE { ?c rdfs:subClassOf+ :Space } ORDER BY ?c')).toEqual([[':Bedroom'], [':Room']]);
  });

  it('keeps the language tag of each label', async () => {
    expect(await shown('SELECT ?l WHERE { :Room rdfs:label ?l } ORDER BY ?l')).toEqual([['"Raum"@de'], ['"Room"@en']]);
  });

  it('returns the restriction as a blank node that is in the store', async () => {
    const result = await select('SELECT ?r WHERE { :Room rdfs:subClassOf ?r FILTER(isBlank(?r)) }');
    expect(result.rows).toHaveLength(1);
    const r = result.rows[0].r;
    expect(r.termType).toBe('BlankNode');
    expect(store.getQuads(r as Term, null, null, null).length).toBeGreaterThan(0);
  });

  it('counts five classes', async () => {
    expect(await shown('SELECT (COUNT(?c) AS ?n) WHERE { ?c a owl:Class }')).toEqual([['"5"^^xsd:integer']]);
  });

  it('names classes and a relationship that "Show in graph" finds in the drawn graph (#203)', async () => {
    const parsed = await parseRdfToGraph(text, { path: EXAMPLE });
    const graph = { nodes: parsed.graphData.nodes, edges: parsed.graphData.edges, objectProperties: parsed.objectProperties };
    const iris = async (query: string) => irisInTable((await describeResult(await runQuery([store], `${HEADER}
${query}`), declared)) as Extract<ResultView, { kind: 'table' }>);

    expect(matchIrisToGraph(await iris('SELECT ?c WHERE { ?c rdfs:subClassOf+ :Space }'), graph).nodeIds.sort()).toEqual(['Bedroom', 'Room']);
    expect(matchIrisToGraph(await iris('SELECT ?p WHERE { ?p a owl:ObjectProperty }'), graph)).toEqual({ nodeIds: [], edgeIds: ['Room->Wall:hasPart'] });
    expect(matchIrisToGraph(await iris('SELECT (COUNT(?c) AS ?n) WHERE { ?c a owl:Class }'), graph)).toEqual({ nodeIds: [], edgeIds: [] });
  });

  it('answers an ASK query', async () => {
    expect(await runQuery([store], `${HEADER}\nASK { :Door a owl:Class }`)).toEqual({ kind: 'boolean', value: true });
  });

  it('CONSTRUCT gives the two subclass triples between classes', async () => {
    const result = await runQuery([store], `${HEADER}\nCONSTRUCT { ?c rdfs:subClassOf ?p } WHERE { ?c rdfs:subClassOf ?p . ?p a owl:Class }`);
    expect(result.kind).toBe('quads');
    if (result.kind !== 'quads') return;
    expect(result.quads.map((q) => `${q.subject.value.split('#')[1]} -> ${q.object.value.split('#')[1]}`).sort()).toEqual([
      'Bedroom -> Room',
      'Room -> Space',
    ]);
  });

  it('refuses the update the header ends with', async () => {
    await expect(runQuery([store], 'DELETE WHERE { ?s ?p ?o }')).rejects.toThrow(/read-only/i);
  });
});

describe('examples/sparql/instance-data.ttl (#181)', () => {
  const PATH = join(dirname(fileURLToPath(import.meta.url)), '../../examples/sparql/instance-data.ttl');
  const ttl = readFileSync(PATH, 'utf-8');
  let instanceStore: Store;
  let instancePrefixes: Record<string, string>;
  beforeAll(async () => {
    const parsed = await parseRdfToGraph(ttl, { path: PATH });
    instanceStore = parsed.store;
    instancePrefixes = parsed.prefixes ?? {};
  });

  it('draws one class, and the bottom bar warns about the four individuals it does not draw', async () => {
    const parsed = await parseRdfToGraph(ttl, { path: PATH });
    expect(parsed.graphData.nodes).toHaveLength(1);
    expect(detectInstanceData(instanceStore)).toMatchObject({ type: 'instance_data_not_drawn', elementName: '4 individuals' });
  });

  it("the panel's starting query lists the four individuals with their classes", async () => {
    const header = prefixHeader(instancePrefixes);
    const result = await runQuery([instanceStore], `${header}\n\n${INDIVIDUALS_STARTER_QUERY}`);
    if (result.kind !== 'bindings') throw new Error('expected bindings');
    const view = await describeResult(result, withStandardPrefixes(instancePrefixes));
    if (view.kind !== 'table') throw new Error('expected a table');
    expect(view.rows.map((row) => row.map((cell) => cell?.text))).toEqual([
      [':door1', ':Door'],
      [':room1', ':Room'],
      [':room2', ':Room'],
      [':wallA', ':Wall'],
    ]);
  });

  it('the links query returns the two hasDoor links, and not the rdf:type triples', async () => {
    const header = prefixHeader(instancePrefixes);
    const result = await runQuery([instanceStore], `${header}\nSELECT ?a ?b WHERE { ?a :hasDoor ?b } ORDER BY ?a`);
    if (result.kind !== 'bindings') throw new Error('expected bindings');
    expect(result.rows.map((r) => [r.a.value, r.b.value])).toEqual([
      ['http://example.org/examples/instance-data#room1', 'http://example.org/examples/instance-data#door1'],
      ['http://example.org/examples/instance-data#room2', 'http://example.org/examples/instance-data#door1'],
    ]);
  });
});
