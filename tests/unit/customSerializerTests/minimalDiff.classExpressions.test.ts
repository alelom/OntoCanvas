/**
 * Minimal-diff contract for anonymous class expressions in rdfs:domain / rdfs:range (#65).
 *
 * `[ rdf:type owl:Class ; owl:unionOf ( :A :B ) ]` and its intersectionOf / oneOf / complementOf
 * siblings hold an RDF list inside a blank node. The custom serializer used to lose track of the
 * list quads and emit a dangling `_:df_x` reference, which storeToTurtle caught by falling back to
 * rdflib (#64) — data-safe, but the whole file was reformatted. These saves must stay minimal-diff.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DataFactory, type Store } from 'n3';
import { storeToTurtle, parseRdfToGraph } from '../../../src/parser';
import { parseTtlWithCache, modifyLabel } from './helpers';
import { lineDiff, formatDiff } from './minimalDiff';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures');

const normalize = (s: string): string => s.replace(/\r\n/g, '\n');
const { namedNode, literal } = DataFactory;
const RDF_FIRST = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#first');
const RDFS_COMMENT = namedNode('http://www.w3.org/2000/01/rdf-schema#comment');

interface Case {
  fixture: string;
  /** A property whose domain or range is a class expression. */
  expressionSubject: string;
  /** A class with no class expression of its own. */
  plainSubject: string;
}

const CASES: Case[] = [
  { fixture: 'unionDomain.ttl', expressionSubject: 'http://example.org/o#scale', plainSubject: 'http://example.org/o#Layout' },
  { fixture: 'classExpressions.ttl', expressionSubject: 'http://example.org/ce#paperSize', plainSubject: 'http://example.org/ce#Sheet' },
  // A class enumerated with a bare collection, `owl:oneOf ( :Undefined :Horizontal :Vertical )`.
  { fixture: 'enumeratedClass.ttl', expressionSubject: 'http://example.org/enum#OrientationValue', plainSubject: 'http://example.org/enum#Sheet' },
];

async function save(content: string, edit?: (s: Store) => void): Promise<string> {
  const { store, cache } = await parseTtlWithCache(content);
  edit?.(store as unknown as Store);
  return storeToTurtle(store as never, undefined, content, cache, 'custom');
}

/** The output must parse back to as many triples as the edited store had (no expression dropped). */
async function expectSameTripleCount(out: string, content: string): Promise<void> {
  const reparsed = await parseRdfToGraph(out, { path: 'out.ttl' });
  const original = await parseRdfToGraph(content, { path: 'in.ttl' });
  expect(reparsed.store.size).toBe(original.store.size);
}

describe('custom serializer keeps class expressions in domain/range minimal-diff (#65)', () => {
  for (const { fixture, expressionSubject, plainSubject } of CASES) {
    const content = readFileSync(join(FIXTURES_DIR, fixture), 'utf-8');

    it(`[${fixture}] a no-op save is byte-identical`, async () => {
      const out = await save(content);
      expect(normalize(out)).toBe(normalize(content));
    });

    it(`[${fixture}] editing the label of a property with a class expression changes only that line`, async () => {
      const out = await save(content, (s) => modifyLabel(s, expressionSubject, 'EDITED'));
      const diff = lineDiff(content, out);
      expect(diff.removed.length, formatDiff(content, out)).toBe(1);
      expect(diff.added, formatDiff(content, out)).toEqual([diff.removed[0].replace(/"[^"]*"/, '"EDITED"')]);
      await expectSameTripleCount(out, content);
    });

    it(`[${fixture}] editing an unrelated class changes only that line`, async () => {
      const out = await save(content, (s) => modifyLabel(s, plainSubject, 'EDITED'));
      const diff = lineDiff(content, out);
      expect(diff.removed.length, formatDiff(content, out)).toBe(1);
      expect(diff.added, formatDiff(content, out)).toEqual([diff.removed[0].replace(/"[^"]*"/, '"EDITED"')]);
      await expectSameTripleCount(out, content);
    });
  }

  // A block that genuinely changed is re-serialized rather than patched line by line; its class
  // expression must still come out as `( … )`, not as nested rdf:first / rdf:rest blank nodes.
  describe('a re-serialized block writes its class expression as in the source', () => {
    const content = readFileSync(join(FIXTURES_DIR, 'unionDomain.ttl'), 'utf-8');

    it('adding a comment to a property with a union domain only adds that line', async () => {
      const out = await save(content, (s) => s.addQuad(namedNode('http://example.org/o#scale'), RDFS_COMMENT, literal('A note.')));
      expect(formatDiff(content, out)).toBe([
        '-     rdfs:range xsd:string .',
        '+     rdfs:range xsd:string ;',
        '+     rdfs:comment "A note." .',
      ].join('\n'));
    });

    it('changing a union member rewrites only the domain line, keeping the collection syntax', async () => {
      const out = await save(content, (s) => {
        const [q] = s.getQuads(null, RDF_FIRST, namedNode('http://example.org/o#Layout'), null);
        s.removeQuad(q);
        s.addQuad(q.subject, q.predicate, namedNode('http://example.org/o#Section'), q.graph);
      });
      expect(formatDiff(content, out)).toBe([
        '-     rdfs:domain [ rdf:type owl:Class ; owl:unionOf ( :DrawingSheet :Layout ) ] ;',
        '+     rdfs:domain [ rdf:type owl:Class ; owl:unionOf ( :DrawingSheet :Section ) ] ;',
      ].join('\n'));
    });
  });
});
