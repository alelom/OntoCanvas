/**
 * Subjects written with a named prefix must be recognised as already present in the source.
 *
 * The minimal-diff serializer resolves each cached block's subject through the file's @prefix
 * declarations to decide which subjects the document already contains; anything left over is
 * treated as newly added and appended. Only the FIRST @prefix per header block was read, so in a
 * file that declares all its prefixes together every later prefix was unknown — and every subject
 * written with one was appended a second time on save, duplicating it.
 *
 * https://github.com/alelom/OntoCanvas/issues/32
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  parseRdfToGraph,
  storeToTurtle,
  updateCommentInStore,
  type SerializerType,
} from '../../../src/parser';
import { meaningfulLineDiff, changedLineCount, formatDiff } from './minimalDiff';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '../../fixtures/aec-provenance-typing-stubs.ttl');

/** The four PROV-O typing stubs, all written with the `prov:` prefix. */
const PREFIXED_SUBJECTS = ['prov:Agent', 'prov:wasAttributedTo', 'prov:wasDerivedFrom', 'prov:generatedAtTime'];

async function setup() {
  const original = readFileSync(FIXTURE, 'utf-8');
  const { store, originalFileCache } = await parseRdfToGraph(original, { path: FIXTURE });
  expect(originalFileCache).toBeTruthy();
  const serialize = () =>
    storeToTurtle(store!, undefined, original, originalFileCache!, 'custom' as SerializerType);
  return { original, store: store!, serialize };
}

/** How many times `subject` starts a statement. */
function declarationCount(turtle: string, subject: string): number {
  const escaped = subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (turtle.match(new RegExp(`^${escaped}\\s`, 'gm')) ?? []).length;
}

describe('Subjects written with a named prefix', () => {
  it('round-trips byte-for-byte when nothing is edited', async () => {
    const { original, serialize } = await setup();
    const out = await serialize();
    expect(changedLineCount(original, out), `unedited save drifted:\n${formatDiff(original, out)}`).toBe(0);
  });

  it('is not appended a second time on save', async () => {
    const { original, serialize } = await setup();
    const out = await serialize();
    for (const subject of PREFIXED_SUBJECTS) {
      expect(declarationCount(original, subject), `${subject} in the source`).toBe(1);
      expect(declarationCount(out, subject), `${subject} after saving`).toBe(1);
    }
  });

  it('leaves the prefixed stanzas alone when an unrelated class is edited', async () => {
    const { original, store, serialize } = await setup();
    expect(updateCommentInStore(store, 'InferenceMeta', 'A shorter comment.')).toBe(true);
    const out = await serialize();

    for (const subject of PREFIXED_SUBJECTS) {
      expect(declarationCount(out, subject), `${subject} after an unrelated edit`).toBe(1);
    }
    const d = meaningfulLineDiff(original, out);
    expect(d.added, `unexpected additions:\n${formatDiff(original, out)}`).toEqual([
      'rdfs:comment "A shorter comment." .',
    ]);
  });
});
