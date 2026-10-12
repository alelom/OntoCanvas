/**
 * Minimal-diff contract for a subject described in more than one statement (#118):
 *
 *   :Layout rdf:type owl:Class ; rdfs:label "Layout" .
 *   …
 *   :Layout rdfs:subClassOf [ … ] .
 *
 * Each statement keeps its own triples. The serializer used to give every statement all of the
 * subject's triples, so a save either threw (the first statement "held" a restriction its text has
 * no line for) or merged the two statements into one rewritten block.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DataFactory, type Store } from 'n3';
import { storeToTurtle, parseRdfToGraph } from '../../../src/parser';
import { parseTtlWithCache, modifyLabel } from './helpers';
import { formatDiff } from './minimalDiff';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures');

const normalize = (s: string): string => s.replace(/\r\n/g, '\n');
const { namedNode, literal } = DataFactory;
const S = 'http://example.org/split#';
const RDFS_COMMENT = namedNode('http://www.w3.org/2000/01/rdf-schema#comment');
const RDFS_SUBCLASSOF = namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf');
const MIN_QUALIFIED = namedNode('http://www.w3.org/2002/07/owl#minQualifiedCardinality');
const NON_NEG = namedNode('http://www.w3.org/2001/XMLSchema#nonNegativeInteger');

async function save(content: string, edit?: (s: Store) => void): Promise<string> {
  const { store, cache } = await parseTtlWithCache(content);
  edit?.(store as unknown as Store);
  return storeToTurtle(store as never, undefined, content, cache, 'custom');
}

async function tripleCount(ttl: string): Promise<number> {
  return (await parseRdfToGraph(ttl, { path: 'x.ttl' })).store.size;
}

describe('custom serializer keeps a subject split across statements minimal-diff (#118)', () => {
  for (const fixture of ['splitSubject.ttl', 'uc01-merged-for-visualization.ttl']) {
    it(`[${fixture}] a no-op save is byte-identical`, async () => {
      const content = readFileSync(join(FIXTURES_DIR, fixture), 'utf-8');
      expect(normalize(await save(content))).toBe(normalize(content));
    });
  }

  const content = readFileSync(join(FIXTURES_DIR, 'splitSubject.ttl'), 'utf-8');

  it('editing the label in the first statement changes only that line', async () => {
    const out = await save(content, (s) => modifyLabel(s, S + 'Layout', 'EDITED'));
    expect(formatDiff(content, out)).toBe(['-     rdfs:label "Layout" ;', '+     rdfs:label "EDITED" ;'].join('\n'));
  });

  it('editing the restriction in the second statement leaves the first statement alone', async () => {
    const out = await save(content, (s) => {
      const [q] = s.getQuads(null, MIN_QUALIFIED, null, null);
      s.removeQuad(q);
      s.addQuad(q.subject, q.predicate, literal('2', NON_NEG), q.graph);
    });
    expect(formatDiff(content, out)).toBe([
      '-     owl:minQualifiedCardinality "1"^^xsd:nonNegativeInteger ;',
      '+     owl:minQualifiedCardinality "2"^^xsd:nonNegativeInteger ;',
    ].join('\n'));
    expect(await tripleCount(out)).toBe(await tripleCount(content));
  });

  it('a triple added to the subject goes into its first statement', async () => {
    const out = await save(content, (s) => s.addQuad(namedNode(S + 'Layout'), RDFS_COMMENT, literal('Another note.')));
    expect(formatDiff(content, out)).toBe([
      '-     rdfs:comment "A drawing layout." .',
      '+     rdfs:comment "A drawing layout.", "Another note." .',
    ].join('\n'));
    expect(await tripleCount(out)).toBe((await tripleCount(content)) + 1);
  });

  it('removing the restriction removes the second statement, and only it', async () => {
    const out = await save(content, (s) => {
      const [q] = s.getQuads(namedNode(S + 'Layout'), RDFS_SUBCLASSOF, null, null);
      for (const inner of s.getQuads(q.object, null, null, null)) s.removeQuad(inner);
      s.removeQuad(q);
    });
    expect(formatDiff(content, out)).toBe([
      '- :Layout rdfs:subClassOf [',
      '-     rdf:type owl:Restriction ;',
      '-     owl:onProperty :hasDiscipline ;',
      '-     owl:minQualifiedCardinality "1"^^xsd:nonNegativeInteger ;',
      '-     owl:onClass :Discipline',
      '- ] .',
      '- ', // one of the blank lines around it (#123)
    ].join('\n'));
    expect(await tripleCount(out)).toBe((await tripleCount(content)) - 5);
  });
});
