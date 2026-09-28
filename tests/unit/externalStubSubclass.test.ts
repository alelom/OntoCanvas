import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseRdfToGraph } from '../../src/parser';
import { expandWithExternalRefs } from '../../src/graph/externalExpansion';
import type { ExternalOntologyReference } from '../../src/storage';

/**
 * Regression: an external-namespace class that is *also* declared locally as an
 * owl:Class stub (e.g. geo:Geometry reused for alignment) must render as a SINGLE
 * node, with the subClassOf line attached to it.
 *
 * The bug: the parser creates a local node keyed by local name ("Geometry"), while
 * expandWithExternalRefs independently added a second node keyed by the full external
 * URI. The two were never reconciled, so the graph showed two "Geometry" nodes and the
 * subclass line attached only to the local one, leaving the external-looking node
 * orphaned (no connecting line).
 */
describe('external-namespace class declared locally as an owl:Class stub', () => {
  const geosparqlUri = 'http://www.opengis.net/ont/geosparql#Geometry';
  const externalRefs: ExternalOntologyReference[] = [
    { url: 'http://www.opengis.net/ont/geosparql#', usePrefix: true, prefix: 'geo' },
  ];

  async function expand() {
    const ttl = readFileSync(join(__dirname, '../fixtures/localExternalStubSubclass.ttl'), 'utf-8');
    const result = await parseRdfToGraph(ttl, { path: 'localExternalStubSubclass.ttl' });
    return expandWithExternalRefs(result.graphData, result.store, externalRefs, {
      displayExternalReferences: true,
      externalNodeLayout: 'auto',
    });
  }

  it('renders the stub as exactly one node (no external duplicate)', async () => {
    const expanded = await expand();
    const geometryNodes = expanded.nodes.filter(
      (n) => n.id === 'Geometry' || n.id === geosparqlUri
    );
    expect(geometryNodes.map((n) => n.id)).toEqual(['Geometry']);
  });

  it('keeps the subClassOf line attached to the single stub node', async () => {
    const expanded = await expand();
    const subEdges = expanded.edges.filter((e) => e.type === 'subClassOf');
    expect(subEdges).toEqual([
      expect.objectContaining({ from: 'BoundingBox', to: 'Geometry' }),
    ]);
    // No dangling edge to the full external URI.
    expect(subEdges.some((e) => e.to === geosparqlUri)).toBe(false);
  });
});
