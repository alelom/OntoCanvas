/**
 * Minimal-diff contract for Turtle layouts the custom serializer used to reject or rewrite:
 * collections as values (#119), a full IRI continuing an object list (#120), a predicate repeated
 * on several lines (#121), relative IRIs under @base (#122), deleting a statement (#123), and a
 * statement starting where the previous one ends, with blank-node labels that have no triples (#124),
 * escaped and tagged literals, and a full IRI as a predicate (#125).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DataFactory, type Store } from 'n3';
import { storeToTurtle, parseRdfToGraph } from '../../../src/parser';
import { parseTtlWithCache, modifyLabel } from './helpers';
import { lineDiff, formatDiff } from './minimalDiff';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf-8');
const normalize = (s: string): string => s.replace(/\r\n/g, '\n');
const { namedNode, literal } = DataFactory;
const RDFS_COMMENT = namedNode('http://www.w3.org/2000/01/rdf-schema#comment');

async function save(content: string, edit?: (s: Store) => void): Promise<string> {
  const { store, cache } = await parseTtlWithCache(content);
  edit?.(store as unknown as Store);
  return storeToTurtle(store as never, undefined, content, cache, 'custom');
}

async function tripleCount(ttl: string): Promise<number> {
  return (await parseRdfToGraph(ttl, { path: 'x.ttl' })).store.size;
}

/** The output changes exactly one line: the label of `subject`, now "EDITED". */
async function expectOnlyLabelEdited(content: string, subject: string): Promise<void> {
  const out = await save(content, (s) => modifyLabel(s, subject, 'EDITED'));
  const diff = lineDiff(content, out);
  expect(diff.removed.length, formatDiff(content, out)).toBe(1);
  expect(diff.added, formatDiff(content, out)).toEqual([diff.removed[0].replace(/"[^"]*"/, '"EDITED"')]);
  expect(await tripleCount(out)).toBe(await tripleCount(content));
}

const CASES: { issue: string; file: string; labelled: string }[] = [
  { issue: '#119', file: 'tests/fixtures/rdf-collections.ttl', labelled: 'http://example.org#ClassWithNestedList' },
  { issue: '#120', file: 'examples/display/imported-note.ttl', labelled: 'http://example.org/examples/imported-note#Report' },
  { issue: '#121', file: 'tests/fixtures/aec_drawing_ontology.ttl', labelled: 'http://example.org/aec-drawing-ontology#AddOn' },
  { issue: '#122', file: 'tests/fixtures/base-iri.ttl', labelled: 'http://example.org/#AnotherClass' },
  { issue: '#122', file: 'tests/fixtures/base-notation-test.ttl', labelled: 'http://example.org/test#TestClass' },
  { issue: '#124', file: 'tests/fixtures/aec_drawing_metadata_drawing_sheet_renamed_gui.ttl', labelled: 'https://burohappoldmachinelearning.github.io/ADIRO/aec-drawing-metadata#RevisionTable' },
  { issue: '#125', file: 'tests/fixtures/customSerializerFixtures/quoted-strings.ttl', labelled: 'http://example.org/test#TestClass' },
  { issue: '#125', file: 'tests/fixtures/customSerializerFixtures/uri-variations.ttl', labelled: 'http://example.org/test#TestClass' },
];

describe('custom serializer keeps unusual source layouts minimal-diff', () => {
  for (const { issue, file, labelled } of CASES) {
    it(`[${issue}] ${file}: a no-op save is byte-identical`, async () => {
      const content = read(file);
      expect(normalize(await save(content))).toBe(normalize(content));
    });

    it(`[${issue}] ${file}: editing a label changes only that line`, async () => {
      await expectOnlyLabelEdited(read(file), labelled);
    });
  }

  it('[#119] a re-serialized statement keeps writing its collections as ( … ) and ()', async () => {
    const content = read('tests/fixtures/rdf-collections.ttl');
    const out = await save(content, (s) => {
      s.addQuad(namedNode('http://example.org#ClassWithEmptyList'), RDFS_COMMENT, literal('Empty.'));
      s.addQuad(namedNode('http://example.org#ClassWithNestedList'), RDFS_COMMENT, literal('Nested.'));
    });
    const diff = lineDiff(content, out);
    expect(diff.removed, formatDiff(content, out)).toEqual(['    :hasItems () .', '    :hasItems ( ( :item1 :item2 ) ( :item3 :item4 ) ) .']);
    expect(diff.added, formatDiff(content, out)).toEqual([
      '    :hasItems () ;', '    rdfs:comment "Empty." .',
      '    :hasItems ( ( :item1 :item2 ) ( :item3 :item4 ) ) ;', '    rdfs:comment "Nested." .',
    ]);
    expect(await tripleCount(out)).toBe((await tripleCount(content)) + 2);
  });

  it('[#121] editing one of two lines of the same predicate changes only that line', async () => {
    const content = read('tests/fixtures/aec_drawing_ontology.ttl');
    const ontology = namedNode('http://example.org/aec-drawing-ontology#Ontology');
    const out = await save(content, (s) => {
      const [q] = s.getQuads(ontology, RDFS_COMMENT, literal('Created/edited with https://alelom.github.io/OntoCanvas/ version 1.0.4'), null);
      s.removeQuad(q);
      s.addQuad(ontology, RDFS_COMMENT, literal('Edited.'));
    });
    expect(formatDiff(content, out)).toBe([
      '-     rdfs:comment "Created/edited with https://alelom.github.io/OntoCanvas/ version 1.0.4" .',
      '+     rdfs:comment "Edited." .',
    ].join('\n'));
  });

  it('[#123] deleting a statement also removes one of the blank lines around it', async () => {
    const content = read('tests/fixtures/splitSubject.ttl');
    const sheet = namedNode('http://example.org/split#Discipline');
    const out = await save(content, (s) => {
      for (const q of s.getQuads(sheet, null, null, null)) s.removeQuad(q);
    });
    const expected = normalize(content).replace(':Discipline rdf:type owl:Class ;\n    rdfs:label "Discipline" .\n\n', '');
    expect(normalize(out)).toBe(expected);
  });
});
