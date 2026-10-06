import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { DataFactory, type Store } from 'n3';
import { parseTtlWithCache, modifyLabel } from './customSerializerTests/helpers';
import { storeToTurtle, parseRdfToGraph } from '../../src/parser';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');
const NS = 'http://example.org/ce#';
const OWL = 'http://www.w3.org/2002/07/owl#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';

/** Describe the single anonymous expression on a property's domain/range as `op(values)`, or null
 * if that side is not exactly one blank node carrying `op` (e.g. it was flattened on save). */
function expressionOn(store: Store, prop: string, side: 'domain' | 'range', op: string): string | null {
  const quads = store.getQuads(DataFactory.namedNode(NS + prop), DataFactory.namedNode(RDFS + side), null, null);
  if (quads.length !== 1 || quads[0].object.termType !== 'BlankNode') return null;
  const opQuad = store.getQuads(quads[0].object as never, DataFactory.namedNode(OWL + op), null, null)[0];
  if (!opQuad) return null;
  const local = (v: string) => v.split(/[#/]/).pop() ?? v;
  if (opQuad.object.termType !== 'BlankNode') return `${op}(${local(opQuad.object.value)})`;
  const items: string[] = [];
  let node = opQuad.object as { termType: string; value: string } | undefined;
  while (node && node.value !== RDF + 'nil') {
    const first = store.getQuads(node as never, DataFactory.namedNode(RDF + 'first'), null, null)[0];
    if (!first) break;
    items.push(local(first.object.value));
    node = store.getQuads(node as never, DataFactory.namedNode(RDF + 'rest'), null, null)[0]?.object as never;
  }
  return `${op}(${items.join(',')})`;
}

/** Saving must never drop or rewrite intersection / complement / enumeration expressions (#60–#62). */
describe('class expression round-trip (#60, #61, #62)', () => {
  const content = readFileSync(join(FIXTURES_DIR, 'classExpressions.ttl'), 'utf-8');

  async function roundTrip(serializer: 'rdflib' | 'custom', edit?: (s: Store) => void): Promise<Store> {
    const { store, cache } = await parseTtlWithCache(content);
    edit?.(store);
    const out = await storeToTurtle(store, undefined, content, cache, serializer);
    return (await parseRdfToGraph(out, { path: 'out.ttl' })).store as unknown as Store;
  }

  const expected: Array<[string, 'domain' | 'range', string, string]> = [
    ['hasRevision', 'domain', 'intersectionOf', 'intersectionOf(Drawing,Approved)'],
    ['approvalCode', 'domain', 'intersectionOf', 'intersectionOf(Drawing,Approved)'],
    ['supersedes', 'range', 'complementOf', 'complementOf(Draft)'],
    ['issueDate', 'domain', 'complementOf', 'complementOf(Draft)'],
    ['hasOrientation', 'range', 'oneOf', 'oneOf(Portrait,Landscape)'],
    ['hasStatus', 'range', 'oneOf', 'oneOf(Current,Superseded)'],
    ['paperSize', 'range', 'oneOf', 'oneOf(A0,A1,A3)'],
  ];

  for (const serializer of ['rdflib', 'custom'] as const) {
    for (const edit of [undefined, (s: Store) => modifyLabel(s, NS + 'Sheet', 'Sheet (renamed)')]) {
      const when = edit ? 'after an unrelated label edit' : 'on an unchanged save';
      it(`[${serializer}] preserves every expression ${when}`, async () => {
        const store = await roundTrip(serializer, edit);
        for (const [prop, side, op, want] of expected) {
          expect(expressionOn(store, prop, side, op), `${prop} ${side}`).toBe(want);
        }
      });
    }
  }
});
