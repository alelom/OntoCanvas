/**
 * Minimal-diff contract for the custom TTL serializer — Groups A, B, C.
 *
 * These exercise the REAL end-to-end path the app uses on save:
 *   parseRdfToGraph -> (surgical store edit) -> storeToTurtle(..., cache, 'custom')
 * and assert that each edit touches ONLY the lines it logically affects. Unrelated
 * blocks (especially classes with rdfs:subClassOf lists / inline blank-node
 * restrictions) must remain byte-for-byte identical.
 *
 *   Group A — class label rename
 *   Group B — class comment add / change / delete
 *   Group C — add a new class
 *
 * Contract: parseRdfToGraph must provide an originalFileCache; storeToTurtle with
 * 'custom' performs cache-based reconstruction.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  parseRdfToGraph,
  storeToTurtle,
  updateLabelInStore,
  updateCommentInStore,
  addNodeToStore,
  type SerializerType,
} from '../../../src/parser';
import {
  meaningfulLineDiff,
  changedLineCount,
  formatDiff,
  blockUnchanged,
  extractBlock,
} from './minimalDiff';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '../../fixtures');
const MDF = join(FIXTURES, 'minimal-diff-fixture.ttl');
const AEC = join(FIXTURES, 'aec_drawing_metadata.ttl');

async function setup(fixturePath: string) {
  const original = readFileSync(fixturePath, 'utf-8');
  const { store, originalFileCache } = await parseRdfToGraph(original, { path: fixturePath });
  expect(originalFileCache, 'fixture must parse with a position cache').toBeTruthy();
  const serialize = () =>
    storeToTurtle(store, undefined, original, originalFileCache!, 'custom' as SerializerType);
  return { original, store, cache: originalFileCache!, serialize };
}

/** Assert each named block is byte-identical between before/after, with a helpful message. */
function expectBlocksUnchanged(before: string, after: string, subjects: string[]) {
  for (const subj of subjects) {
    const r = blockUnchanged(before, after, subj);
    if (!r.equal) {
      throw new Error(
        `Block ${subj} was modified but should be unchanged.\n` +
          `--- before ---\n${r.before}\n--- after ---\n${r.after}\n`
      );
    }
    expect(r.equal, `${subj} block unchanged`).toBe(true);
  }
}

// ===========================================================================
// Group A — label rename
// ===========================================================================
describe('Group A — class label rename (minimal diff)', () => {
  it('A1: renaming a simple class label changes only the label line', async () => {
    const { original, store, serialize } = await setup(MDF);

    expect(updateLabelInStore(store, 'Building', 'Building Structure')).toBe(true);
    const out = await serialize();

    // Intended change present:
    expect(out).toContain('rdfs:label "Building Structure"');
    expect(out).not.toContain('rdfs:label "Building"');

    // The :Building comment line and every other block untouched:
    expect(out).toContain('rdfs:comment "A structure with walls and a roof."');
    expectBlocksUnchanged(original, out, [':Floor', ':Room', ':Wall', ':contains', ':labellableRoot']);

    // In the fixture, :Building's label line is mid-block, so it ends with ';'.
    const d = meaningfulLineDiff(original, out);
    expect(d.removed, `unexpected removals:\n${formatDiff(original, out)}`).toEqual([
      'rdfs:label "Building" ;',
    ]);
    expect(d.added).toEqual(['rdfs:label "Building Structure" ;']);
  });

  it('A3: renaming a class that has a subClassOf list + inline restriction leaves the list byte-identical', async () => {
    const { original, store, serialize } = await setup(MDF);

    // :Room has: rdfs:subClassOf :Floor, [ owl:Restriction ... ] ; label ; comment ; labellableRoot
    expect(updateLabelInStore(store, 'Room', 'Sleeping Room')).toBe(true);
    const out = await serialize();

    expect(out).toContain('rdfs:label "Sleeping Room"');

    // The subClassOf list (named parent + inline restriction) must be preserved verbatim.
    expect(out).toContain('rdfs:subClassOf :Floor,');
    expect(out).toContain(
      '[ rdf:type owl:Restriction ; owl:onProperty :contains ; owl:onClass :Building ; owl:qualifiedCardinality "1"^^xsd:nonNegativeInteger ]'
    );
    // The typed boolean annotation must NOT be normalized to a plain literal.
    expect(out).toContain(':labellableRoot "true"^^xsd:boolean');
    expect(out).not.toMatch(/:labellableRoot\s+true\s*\./);

    // Only the label line should differ across the whole file.
    const d = meaningfulLineDiff(original, out);
    expect(d.removed, `unexpected removals:\n${formatDiff(original, out)}`).toEqual([
      'rdfs:label "Room" ;',
    ]);
    expect(d.added).toEqual(['rdfs:label "Sleeping Room" ;']);
  });

  it('A4: rdf:type is not rewritten to "a" on restriction-bearing blocks', async () => {
    const { original, store, serialize } = await setup(MDF);
    expect(updateLabelInStore(store, 'Room', 'Sleeping Room')).toBe(true);
    const out = await serialize();
    // Original uses "rdf:type owl:Class" everywhere; the serializer must not switch to "a".
    expect(out).toContain(':Room rdf:type owl:Class');
    expect(out).not.toMatch(/:Room\s+a\s+owl:Class/);
    // Sanity: number of "rdf:type owl:Class" occurrences unchanged.
    const count = (s: string) => (s.match(/rdf:type owl:Class/g) || []).length;
    expect(count(out)).toBe(count(original));
  });

  it('A5 (real-world AEC): renaming one class does not thrash sibling restriction blocks', async () => {
    const { original, store, serialize } = await setup(AEC);

    expect(updateLabelInStore(store, 'Detail', 'Detail Drawing')).toBe(true);
    const out = await serialize();

    expect(out).toContain('rdfs:label "Detail Drawing"');

    // Sibling classes that contain restrictions must be untouched.
    expectBlocksUnchanged(original, out, [':DrawingSheet', ':FacadeSystem']);

    // Whole-file churn should be tiny (just the one label line).
    const churn = changedLineCount(original, out);
    expect(churn, `too much churn:\n${formatDiff(original, out)}`).toBeLessThanOrEqual(2);
  });
});

// ===========================================================================
// Group B — comment add / change / delete
// ===========================================================================
describe('Group B — class comment (minimal diff)', () => {
  it('B1: adding a comment to a class with none inserts one line; other blocks unchanged', async () => {
    const { original, store, serialize } = await setup(MDF);

    // :Floor has only a label, no comment.
    expect(updateCommentInStore(store, 'Floor', 'A horizontal level of a building.')).toBe(true);
    const out = await serialize();

    expect(out).toContain('rdfs:comment "A horizontal level of a building."');

    // No existing block other than :Floor may change.
    expectBlocksUnchanged(original, out, [':Building', ':Room', ':Wall', ':contains', ':labellableRoot']);

    // Adding a property turns the previous terminating '.' into ';' and adds the comment line.
    const d = meaningfulLineDiff(original, out);
    expect(d.removed, `unexpected removals:\n${formatDiff(original, out)}`).toEqual([
      'rdfs:label "Floor" .',
    ]);
    expect(d.added.sort()).toEqual(
      ['rdfs:comment "A horizontal level of a building." .', 'rdfs:label "Floor" ;'].sort()
    );
  });

  it('B2: changing an existing comment changes only the comment line', async () => {
    const { original, store, serialize } = await setup(MDF);

    expect(updateCommentInStore(store, 'Building', 'A roofed structure.')).toBe(true);
    const out = await serialize();

    expect(out).toContain('rdfs:comment "A roofed structure."');
    expectBlocksUnchanged(original, out, [':Floor', ':Room', ':Wall', ':contains', ':labellableRoot']);

    const d = meaningfulLineDiff(original, out);
    expect(d.removed, `unexpected removals:\n${formatDiff(original, out)}`).toEqual([
      'rdfs:comment "A structure with walls and a roof." .',
    ]);
    expect(d.added).toEqual(['rdfs:comment "A roofed structure." .']);
  });

  it('B3: deleting a comment removes only the comment line', async () => {
    const { original, store, serialize } = await setup(MDF);

    expect(updateCommentInStore(store, 'Building', null)).toBe(true);
    const out = await serialize();

    expect(out).not.toContain('rdfs:comment "A structure with walls and a roof."');
    expectBlocksUnchanged(original, out, [':Floor', ':Room', ':Wall', ':contains', ':labellableRoot']);

    // Removing the last property turns the previous ';' into a terminating '.'.
    const d = meaningfulLineDiff(original, out);
    expect(d.removed.sort(), `unexpected removals:\n${formatDiff(original, out)}`).toEqual(
      ['rdfs:comment "A structure with walls and a roof." .', 'rdfs:label "Building" ;'].sort()
    );
    expect(d.added).toEqual(['rdfs:label "Building" .']);
  });
});

// ===========================================================================
// Group C — add a new class
// ===========================================================================
describe('Group C — add a new class (minimal diff)', () => {
  it('C1: adding a class appends a new block and removes no existing lines', async () => {
    const { original, store, serialize } = await setup(MDF);

    const newId = addNodeToStore(store, 'Corridor');
    expect(newId).toBeTruthy();
    const out = await serialize();

    // New class present. Identifier derivation camelCases the label (":corridor"),
    // matching the app's Add-node behaviour; it must land in the file's own namespace.
    expect(out).toMatch(/:corridor\s+(rdf:type|a)\s+owl:Class/);
    expect(out).toContain('rdfs:label "Corridor"');

    // Every pre-existing block is byte-identical.
    expectBlocksUnchanged(original, out, [
      ':Ontology',
      ':labellableRoot',
      ':contains',
      ':Building',
      ':Floor',
      ':Room',
      ':Wall',
    ]);

    // Nothing removed — only additions.
    const d = meaningfulLineDiff(original, out);
    expect(d.removed, `adding a class removed lines:\n${formatDiff(original, out)}`).toEqual([]);
  });

  it('C2: a newly added class uses prefixed (:) notation, consistent with the file', async () => {
    const { original, store, serialize } = await setup(MDF);
    addNodeToStore(store, 'Corridor');
    const out = await serialize();
    // Must not emit a full-URI subject for a local class — it should use the ':' prefix
    // and the file's own namespace (mdf#), not a full URI or the hardcoded default.
    expect(out).not.toMatch(/<http:\/\/example\.org\/[^>]*corridor>/i);
    expect(out).not.toContain('aec-drawing-ontology');
    expect(extractBlock(out, ':corridor'), 'new :corridor block should exist').toBeTruthy();
  });
});
