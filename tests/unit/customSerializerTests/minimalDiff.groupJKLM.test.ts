/**
 * Minimal-diff contract — Groups J–M (class-level annotations, images, restrictions, multi-edit).
 *
 *   J — annotation-property value on a class (e.g. :labellableRoot boolean toggle)
 *   K — example images add / remove on a class
 *   L — data-property restriction add / remove on a class
 *   M — multi-select comment (same comment applied to several classes)
 *
 * Behaviours that work are asserted as passing tests; known-broken ones are `it.skip`
 * "KNOWN BUG" with the strict minimal-diff assertion the upcoming refactor must satisfy.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  parseRdfToGraph,
  storeToTurtle,
  updateAnnotationPropertyValueInStore,
  updateCommentInStore,
  addDataPropertyRestrictionToClass,
  removeDataPropertyRestrictionFromClass,
  type SerializerType,
} from '../../../src/parser';
import { setExampleImageUrisForClass } from '../../../src/lib/exampleImageStore';
import { meaningfulLineDiff, changedLineCount, formatDiff, blockUnchanged } from './minimalDiff';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MDP = join(__dirname, '../../fixtures/minimal-diff-properties-fixture.ttl');
const BASE = 'http://example.org/mdp#';

async function setup() {
  const original = readFileSync(MDP, 'utf-8');
  const { store, originalFileCache } = await parseRdfToGraph(original, { path: MDP });
  expect(originalFileCache).toBeTruthy();
  const serialize = () =>
    storeToTurtle(store, undefined, original, originalFileCache!, 'custom' as SerializerType);
  return { original, store, serialize };
}

// ===========================================================================
// Group J — annotation-property value on a class
// ===========================================================================
describe('Group J — annotation-property value on a class', () => {
  it('J1: toggling :labellableRoot changes only that line and preserves the typed literal', async () => {
    const { original, store, serialize } = await setup();
    expect(updateAnnotationPropertyValueInStore(store, 'Site', 'labellableRoot', false, true)).toBe(true);
    const out = await serialize();

    const d = meaningfulLineDiff(original, out);
    expect(d.removed, `unexpected:\n${formatDiff(original, out)}`).toEqual([':labellableRoot "true"^^xsd:boolean .']);
    expect(d.added).toEqual([':labellableRoot "false"^^xsd:boolean .']);
    // Every other class/property block is untouched.
    for (const s of [':Zone', ':Region', ':District', ':hasPart', ':hasArea', ':relatesTo']) {
      expect(blockUnchanged(original, out, s).equal, `${s} changed`).toBe(true);
    }
  });
});

// ===========================================================================
// Group K — example images
// ===========================================================================
describe('Group K — example images', () => {
  it('K1: removing an example image removes only that line', async () => {
    const { original, store, serialize } = await setup();
    expect(setExampleImageUrisForClass(store, 'Site', [], BASE)).toBe(true);
    const out = await serialize();

    expect(out).not.toContain('site.png');
    const d = meaningfulLineDiff(original, out);
    expect(d.removed, `unexpected:\n${formatDiff(original, out)}`).toEqual([
      ':exampleImage <https://example.org/img/site.png> ;',
    ]);
    expect(d.added).toEqual([]);
  });

  it('K2: adding an example image applies and stays valid', async () => {
    const { store, serialize } = await setup();
    expect(setExampleImageUrisForClass(store, 'Zone', ['https://example.org/img/zone.png'], BASE)).toBe(true);
    const out = await serialize();
    expect(out).toContain(':exampleImage <https://example.org/img/zone.png>');
    const reparsed = await parseRdfToGraph(out, { path: 'reparse.ttl' });
    expect(reparsed.store).toBeTruthy();
  });

  it.skip('K2-MINIMAL (KNOWN BUG): adding an example image must not rewrite rdf:type to "a"', async () => {
    // Adding a property is not detected as a property-level change, so the block goes through
    // block-level serialization which (for this block) emits ":Zone a owl:Class". The
    // rdf:type->a restoration should run but does not in this path. Fix in implementation phase.
    const { original, store, serialize } = await setup();
    setExampleImageUrisForClass(store, 'Zone', ['https://example.org/img/zone.png'], BASE);
    const out = await serialize();
    expect(out).toContain(':Zone rdf:type owl:Class');
    expect(out).not.toMatch(/:Zone\s+a\s+owl:Class/);
    expect(changedLineCount(original, out)).toBeLessThanOrEqual(2);
  });
});

// ===========================================================================
// Group L — data-property restriction on a class
// ===========================================================================
describe('Group L — data-property restriction on a class', () => {
  it('L1: adding a data-property restriction applies, stays valid, and survives a re-parse', async () => {
    const { store, serialize } = await setup();
    expect(addDataPropertyRestrictionToClass(store, 'Zone', 'hasArea', { minCardinality: 1, maxCardinality: null })).toBe(true);
    const out = await serialize();
    expect(out).toContain('owl:onProperty :hasArea');
    expect(out).toContain('owl:minCardinality');
    const reparsed = await parseRdfToGraph(out, { path: 'reparse.ttl' });
    expect(reparsed.store).toBeTruthy();
  });

  it('L2: adding then removing a data-property restriction restores the original', async () => {
    const { original, store, serialize } = await setup();
    addDataPropertyRestrictionToClass(store, 'Zone', 'hasArea', { minCardinality: 1, maxCardinality: null });
    expect(removeDataPropertyRestrictionFromClass(store, 'Zone', 'hasArea')).toBe(true);
    const out = await serialize();
    expect(changedLineCount(original, out), `add+remove restriction drifted:\n${formatDiff(original, out)}`).toBe(0);
  });

  it.skip('L1-MINIMAL (KNOWN BUG): adding a restriction should inline it and not reflow/rewrite the class block', async () => {
    // Currently the class block is re-serialized: rdf:type->a and the new restriction is emitted
    // as an un-inlined "_:n3-0 ..." chain instead of "rdfs:subClassOf [ ... ]". Valid but not minimal.
    const { original, store, serialize } = await setup();
    addDataPropertyRestrictionToClass(store, 'Zone', 'hasArea', { minCardinality: 1, maxCardinality: null });
    const out = await serialize();
    expect(out).toContain(':Zone rdf:type owl:Class');
    expect(out).not.toMatch(/:Zone\s+a\s+owl:Class/);
    expect(out).toMatch(/rdfs:subClassOf \[ /); // inline restriction
    expect(out).not.toMatch(/_:n3-\d+ /); // no expanded blank node
    expect(changedLineCount(original, out)).toBeLessThanOrEqual(2);
  });
});

// ===========================================================================
// Group M — multi-select comment
// ===========================================================================
describe('Group M — multi-select comment', () => {
  it('M1: applying a comment to several classes updates each, leaving other blocks unchanged', async () => {
    const { original, store, serialize } = await setup();
    // Simulates showMultiEditModal applying the same comment to multiple selected classes.
    expect(updateCommentInStore(store, 'Region', 'A broad area.')).toBe(true);
    expect(updateCommentInStore(store, 'District', 'A broad area.')).toBe(true);
    const out = await serialize();

    expect(out).toMatch(/:Region[\s\S]*rdfs:comment "A broad area\."/);
    expect(out).toMatch(/:District[\s\S]*rdfs:comment "A broad area\."/);
    // No rdf:type->a regression on the edited classes.
    expect(out).not.toMatch(/:(Region|District)\s+a\s+owl:Class/);
    // Untouched blocks stay identical.
    for (const s of [':Site', ':Zone', ':hasPart', ':hasArea', ':relatesTo']) {
      expect(blockUnchanged(original, out, s).equal, `${s} changed`).toBe(true);
    }
  });
});
