/**
 * Minimal-diff contract — Group G: save-state foundations.
 *
 * The "unsaved changes" indicator and Save button rely on the serializer being deterministic:
 * a no-op must reproduce the file byte-for-byte (so "no changes" is detectable) and an edit
 * must change the output (so "has changes" is detectable). The actual button visibility /
 * hasUnsavedChanges wiring lives in main.ts and is covered by tests/e2e/saveChanges.e2e.test.ts
 * and tests/unit/saveButtonState.test.ts; here we pin the serializer-level invariants those
 * features depend on.
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
import { changedLineCount } from './minimalDiff';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MDF = join(__dirname, '../../fixtures/minimal-diff-fixture.ttl');

async function load() {
  const original = readFileSync(MDF, 'utf-8');
  const { store, originalFileCache } = await parseRdfToGraph(original, { path: MDF });
  return { original, store, cache: originalFileCache! };
}

describe('Group G — save-state foundations (serializer determinism)', () => {
  it('G1: a no-op save is byte-identical (so "no unsaved changes" is detectable)', async () => {
    const { original, store, cache } = await load();
    const out = await storeToTurtle(store, undefined, original, cache, 'custom' as SerializerType);
    expect(out.replace(/\r\n/g, '\n')).toBe(original.replace(/\r\n/g, '\n'));
  });

  it('G2: the same store+cache serializes identically on repeated calls (deterministic)', async () => {
    const { original, store, cache } = await load();
    const a = await storeToTurtle(store, undefined, original, cache, 'custom' as SerializerType);
    const b = await storeToTurtle(store, undefined, original, cache, 'custom' as SerializerType);
    expect(a).toBe(b);
  });

  it('G3: a confirmed edit changes the output (so "has unsaved changes" is detectable)', async () => {
    const { original, store, cache } = await load();
    updateCommentInStore(store, 'Building', 'A changed description.');
    const out = await storeToTurtle(store, undefined, original, cache, 'custom' as SerializerType);
    expect(changedLineCount(original, out)).toBeGreaterThan(0);
  });
});
