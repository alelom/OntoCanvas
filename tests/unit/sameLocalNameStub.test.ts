import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DataFactory } from 'n3';
import {
  parseRdfToGraph,
  addDataPropertyRestrictionToClass,
  addObjectPropertyToStore,
  getClassNamespace,
  removeNodeFromStore,
  updateLabelInStore,
} from '../../src/parser';
import { expandWithExternalRefs } from '../../src/graph/externalExpansion';
import { validateOntologyStructure } from '../../src/lib/ontologyValidation';
import type { ExternalOntologyReference } from '../../src/storage';
import { detectOntologyIssues } from '../../src/ui/ontologyIssues';

const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';

/**
 * Regression (#164): a class with the same local name as an external stub it subclasses (:Party and std:Party).
 *
 * Nodes are keyed by local name, so the two were one node: whichever was declared first took the name, and
 * `:Party rdfs:subClassOf std:Party` became the self-loop Party → Party, which the validator rejects as a cycle
 * ("Cannot open ontology"). The ontology's own class keeps the local name; the stub is an external node keyed by its
 * full IRI, as an imported class of the same name already was (lib:Book next to :Book).
 */
describe('a local class with the same local name as an external stub', () => {
  const LOCAL = 'http://example.org/examples/same-local-name-stub#';
  const STD = 'http://example.org/examples/standard#';
  const externalRefs: ExternalOntologyReference[] = [{ url: STD, usePrefix: true, prefix: 'std' }];

  async function parse() {
    const ttl = readFileSync(join(__dirname, '../../examples/imports/same-local-name-stub.ttl'), 'utf-8');
    return parseRdfToGraph(ttl, { path: 'same-local-name-stub.ttl' });
  }

  async function expand() {
    const result = await parse();
    return expandWithExternalRefs(result.graphData, result.store, externalRefs, {
      displayExternalReferences: true,
      externalNodeLayout: 'auto',
    });
  }

  it('opens: no cycle is reported', async () => {
    const { graphData } = await parse();
    const validation = validateOntologyStructure(graphData.nodes, graphData.edges);
    expect(validation.errors).toEqual([]);
  });

  it("gives the local name to the ontology's own class, whatever the declaration order", async () => {
    const { graphData } = await parse();
    const byId = new Map(graphData.nodes.map((n) => [n.id, n.uri]));
    expect(byId.get('Party')).toBe(LOCAL + 'Party');
    expect(byId.get('Person')).toBe(LOCAL + 'Person');
  });

  it('draws no edge between a class and itself, and keeps the local subclass and domain/range edges', async () => {
    const { graphData } = await parse();
    expect(graphData.edges.filter((e) => e.from === e.to)).toEqual([]);
    expect(graphData.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'Person', to: 'Party', type: 'subClassOf' }),
        expect.objectContaining({ from: 'Agreement', to: 'Party', type: 'signedBy' }),
      ])
    );
  });

  it('draws each stub as its own external node, with the subClassOf line from the local class', async () => {
    const expanded = await expand();
    const ids = expanded.nodes.map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining(['Party', 'Person', STD + 'Party', STD + 'Person']));
    const sub = expanded.edges.filter((e) => e.type === 'subClassOf');
    expect(sub).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'Party', to: STD + 'Party' }),
        expect.objectContaining({ from: 'Person', to: STD + 'Person' }),
      ])
    );
    expect(expanded.edges.filter((e) => e.from === e.to)).toEqual([]);
  });
});

/**
 * Review of #164: what is drawn under a name is what an edit to that name changes, and the ranking does not depend on
 * the namespace form (`#` or `/`) or on the stubs coming first in the file.
 */
describe('editing a class that shares its local name with an external stub', () => {
  const LOCAL = 'http://example.org/examples/same-local-name-stub#';
  const STD = 'http://example.org/examples/standard#';
  const TTL = readFileSync(join(__dirname, '../../examples/imports/same-local-name-stub.ttl'), 'utf-8');

  const quadsOf = (store: any, subject: string) =>
    store.getQuads(DataFactory.namedNode(subject), null, null, null).map((q: any) => `${q.predicate.value} ${q.object.value}`);

  it('writes a data property restriction on the local class, not the stub', async () => {
    const { store } = await parseRdfToGraph(TTL, { path: 'same-local-name-stub.ttl' });
    addDataPropertyRestrictionToClass(store, 'Party', 'age');
    const restrictionsOn = (uri: string) =>
      store.getQuads(DataFactory.namedNode(uri), DataFactory.namedNode(RDFS + 'subClassOf'), null, null).filter((q) => q.object.termType === 'BlankNode').length;
    expect(restrictionsOn(LOCAL + 'Party')).toBe(1);
    expect(restrictionsOn(STD + 'Party')).toBe(0);
  });

  it('gives a new object property the local class as its domain, and mints it in the local namespace', async () => {
    const { store } = await parseRdfToGraph(TTL, { path: 'same-local-name-stub.ttl' });
    expect(getClassNamespace(store)).toBe(LOCAL);
    addObjectPropertyToStore(store, 'employs', false, 'employs', { domain: 'Party', range: 'Person' });
    expect(quadsOf(store, LOCAL + 'employs')).toEqual(
      expect.arrayContaining([`${RDFS}domain ${LOCAL}Party`, `${RDFS}range ${LOCAL}Person`])
    );
    expect(quadsOf(store, STD + 'employs')).toEqual([]);
  });

  it('relabels only the local class, and deletes a local node from the store', async () => {
    const { store } = await parseRdfToGraph(TTL, { path: 'same-local-name-stub.ttl' });
    updateLabelInStore(store, 'Party', 'Contracting party');
    expect(quadsOf(store, LOCAL + 'Party')).toContain(`${RDFS}label Contracting party`);
    expect(quadsOf(store, STD + 'Party')).toContain(`${RDFS}label Party (standard)`);
    expect(removeNodeFromStore(store, 'Agreement')).toBe(true);
    expect(quadsOf(store, LOCAL + 'Agreement')).toEqual([]);
  });

  it('gives the name to the local class in a slash namespace too', async () => {
    const SLASH = 'http://example.org/examples/same-local-name-stub/';
    const ttl = TTL.replace('@prefix : <http://example.org/examples/same-local-name-stub#> .', `@prefix : <${SLASH}> .`);
    expect(ttl).not.toBe(TTL);
    const { graphData } = await parseRdfToGraph(ttl, { path: 'same-local-name-stub-slash.ttl' });
    const byId = new Map(graphData.nodes.map((n) => [n.id, n.uri]));
    expect(byId.get('Party')).toBe(SLASH + 'Party');
    expect(byId.get('Person')).toBe(SLASH + 'Person');
    expect(graphData.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'Person', to: 'Party', type: 'subClassOf' }),
        expect.objectContaining({ from: 'Agreement', to: 'Party', type: 'signedBy' }),
      ])
    );
  });
});

/**
 * Review of #165: resolving a name ranks only the classes with that name, and the helpers that loop over classes
 * resolve once, so an edit costs a pass over the classes, not one per class. Ranking every class on each lookup made a
 * label edit take about 5 s on 2,000 classes. The bounds are generous; quadratic work blows through them.
 */
describe('class lookups on a large ontology', () => {
  const N = 3000;
  const big = [
    '@prefix : <http://example.org/big#> .',
    '@prefix std: <http://example.org/std#> .',
    '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
    '<http://example.org/big> a owl:Ontology .',
    'std:C0 a owl:Class ; rdfs:isDefinedBy <http://example.org/std> .',
    ...Array.from({ length: N }, (_, i) => `:C${i} a owl:Class ; rdfs:label "C${i}" ; :exampleImage <img/C${i}.png> .`),
  ].join('\n');

  it('relabels one class quickly, and the right one', async () => {
    const { store } = await parseRdfToGraph(big, { path: 'big.ttl' });
    const started = performance.now();
    expect(updateLabelInStore(store, `C${N - 1}`, 'Renamed')).toBe(true); // the last class: a loop must not stop early
    expect(performance.now() - started).toBeLessThan(500);
    const label = store.getObjects(DataFactory.namedNode(`http://example.org/big#C${N - 1}`), DataFactory.namedNode(RDFS + 'label'), null);
    expect(label.map((o) => o.value)).toEqual(['Renamed']);
  });

  it('detects ontology issues without a lookup per class', async () => {
    const { store } = await parseRdfToGraph(big, { path: 'big.ttl' });
    const started = performance.now();
    await detectOntologyIssues(store, null);
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
