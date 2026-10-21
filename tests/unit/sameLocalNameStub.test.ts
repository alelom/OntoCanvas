import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseRdfToGraph } from '../../src/parser';
import { expandWithExternalRefs } from '../../src/graph/externalExpansion';
import { validateOntologyStructure } from '../../src/lib/ontologyValidation';
import type { ExternalOntologyReference } from '../../src/storage';

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
