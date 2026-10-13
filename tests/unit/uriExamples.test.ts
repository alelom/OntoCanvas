import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/parser';
import { resolveEdgeTerm, resolveNodeTerm, type TermLookup } from '../../src/lib/termUri';
import { readOntologyVersion, versionPinnedUri } from '../../src/lib/versionPinnedUri';

const EXAMPLES = join(dirname(fileURLToPath(import.meta.url)), '../../examples');

/** What "Copy version-pinned URI" offers for a node or edge of the example, as the context menu resolves it. */
async function pinner(path: string) {
  const { graphData, store, objectProperties, dataProperties } = await parseRdfToGraph(readFileSync(join(EXAMPLES, path), 'utf-8'), { path });
  const lookup: TermLookup = { nodes: graphData.nodes, objectProperties, dataProperties };
  const version = readOntologyVersion(store);
  return {
    node: (id: string) => versionPinnedUri(resolveNodeTerm(id, lookup)?.uri ?? null, version),
    edge: (id: string) => versionPinnedUri(resolveEdgeTerm(id, lookup)?.uri ?? null, version),
    edges: graphData.edges,
  };
}

/** The examples' header comments promise what the context menu copies; keep them true. */
describe('examples/uris', () => {
  it('version-pinned-uris.ttl: 2.1.0 URIs for its own terms, none for rdfs:subClassOf (#128)', async () => {
    const { node, edge, edges } = await pinner('uris/version-pinned-uris.ttl');
    const NS = 'http://example.org/examples/version-pinned-uris';
    expect(node('Building')).toEqual({ uri: `${NS}/2.1.0#Building`, version: '2.1.0', derived: false });
    const hasFloor = edges.find((e) => e.type === 'hasFloor')!;
    expect(edge(`${hasFloor.from}->${hasFloor.to}:${hasFloor.type}`).uri).toBe(`${NS}/2.1.0#hasFloor`);
    expect(node('__dataprop__Floor__floorArea').uri).toBe(`${NS}/2.1.0#floorArea`);
    const subClassOf = edges.find((e) => e.type === 'subClassOf')!;
    expect(edge(`${subClassOf.from}->${subClassOf.to}:subClassOf`)).toMatchObject({ uri: null, reason: expect.stringContaining('Not defined in this ontology') });
  });

  it('version-from-version-info.ttl: the version IRI is built from owl:versionInfo 1.4.0 (#128)', async () => {
    const { node } = await pinner('uris/version-from-version-info.ttl');
    expect(node('Sensor')).toEqual({ uri: 'http://example.org/examples/version-from-version-info/1.4.0#Sensor', version: '1.4.0', derived: true });
  });
});
