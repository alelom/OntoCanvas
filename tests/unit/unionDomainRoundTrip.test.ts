import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { DataFactory, type Store } from 'n3';
import { parseTtlWithCache, modifyLabel } from './customSerializerTests/helpers';
import { storeToTurtle, parseRdfToGraph, getDataProperties } from '../../src/parser';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');
const OWL = 'http://www.w3.org/2002/07/owl#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';

/** Read the local names of the union members of a property's rdfs:domain, or null if the domain
 * is not a single owl:unionOf blank node (e.g. it was flattened into several NamedNode domains). */
function unionDomainMembers(store: Store, propUri: string): string[] | null {
  const domainQuads = store.getQuads(DataFactory.namedNode(propUri), DataFactory.namedNode(RDFS + 'domain'), null, null);
  if (domainQuads.length !== 1) return null; // more than one domain => flattened to a conjunction
  const obj = domainQuads[0].object;
  if (obj.termType !== 'BlankNode') return null;
  const unionQuad = store.getQuads(obj as never, DataFactory.namedNode(OWL + 'unionOf'), null, null)[0];
  if (!unionQuad) return null;
  // Walk the RDF list.
  const members: string[] = [];
  let node: { termType: string; value: string } | undefined = unionQuad.object as never;
  const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  while (node && node.value !== RDF + 'nil') {
    const first = store.getQuads(node as never, DataFactory.namedNode(RDF + 'first'), null, null)[0];
    const rest = store.getQuads(node as never, DataFactory.namedNode(RDF + 'rest'), null, null)[0];
    if (!first) break;
    members.push((first.object.value || '').split(/[#/]/).pop() || '');
    node = rest?.object as never;
  }
  return members.sort();
}

/**
 * Issue #58 — correctness gate for owl:unionOf in rdfs:domain.
 * Multiple rdfs:domain triples are conjunctive (AND); owl:unionOf means OR. A save must never
 * rewrite a union domain into separate domains (flipping OR -> AND) or drop a member.
 */
describe('owl:unionOf domain round-trip (#58)', () => {
  const content = readFileSync(join(FIXTURES_DIR, 'unionDomain.ttl'), 'utf-8');
  const OP = 'http://example.org/o#hasOrientation';
  const DP = 'http://example.org/o#scale';

  async function roundTrip(serializer: 'rdflib' | 'custom', edit?: (s: Store) => void): Promise<Store> {
    const { store, cache } = await parseTtlWithCache(content);
    edit?.(store);
    const out = await storeToTurtle(store, undefined, content, cache, serializer);
    const reparsed = await parseRdfToGraph(out, { path: 'out.ttl' });
    return reparsed.store as unknown as Store;
  }

  // The app saves .ttl with the custom serializer; rdflib is the fallback. Both must preserve the union.
  for (const serializer of ['rdflib', 'custom'] as const) {
    it(`[${serializer}] keeps both domains as unions on an unchanged save (no OR->AND flip)`, async () => {
      const store = await roundTrip(serializer);
      expect(unionDomainMembers(store, OP)).toEqual(['Detail', 'Section']);
      expect(unionDomainMembers(store, DP)).toEqual(['DrawingSheet', 'Layout']);
    });

    it(`[${serializer}] keeps the unions when an unrelated class label is edited`, async () => {
      const store = await roundTrip(serializer, (s) => modifyLabel(s, 'http://example.org/o#Section', 'Section (renamed)'));
      expect(unionDomainMembers(store, OP)).toEqual(['Detail', 'Section']);
      expect(unionDomainMembers(store, DP)).toEqual(['DrawingSheet', 'Layout']);
    });
  }

  it('baseline: a data-property union domain is currently flattened to its members in the graph model', async () => {
    const { store } = await parseTtlWithCache(content);
    const dps = getDataProperties(store as unknown as Store);
    const scale = dps.find((d) => d.name === 'scale') as { domains?: string[] } | undefined;
    expect(scale?.domains?.sort()).toEqual(['DrawingSheet', 'Layout']);
  });
});
