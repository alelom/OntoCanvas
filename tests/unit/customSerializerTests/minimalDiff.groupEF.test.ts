/**
 * Minimal-diff contract — Group E (edges) and Group F (round-trip idempotency).
 *
 *   Group E — add / edit / remove object-property edges (restrictions).
 *             Asserts correctness (right namespace, valid re-parseable output, no blank-node
 *             collisions) for ANY ontology namespace — the user's real ontology is NOT in the
 *             hardcoded default namespace, where edge ops previously produced corruption.
 *   Group F — load → edit → serialize → reload → reverse-edit → serialize reproduces the file.
 *
 * NOTE: full byte-level minimal-diff for edge edits on classes that ALREADY carry inline
 * restrictions is a known remaining limitation (the edited block is re-serialized, reflowing
 * its rdfs:subClassOf list). Those are captured as it.skip below with an explanation so the
 * gap is documented rather than silently accepted.
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
  removeNodeFromStore,
  addEdgeToStore,
  removeEdgeFromStore,
  type SerializerType,
} from '../../../src/parser';
import { changedLineCount, formatDiff, isAttributionOnlyChange } from './minimalDiff';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '../../fixtures');
const MDF = join(FIXTURES, 'minimal-diff-fixture.ttl'); // namespace: http://example.org/mdf#  (NOT the hardcoded default)
const AEC = join(FIXTURES, 'aec_drawing_metadata.ttl');

async function load(fixturePath: string) {
  const original = readFileSync(fixturePath, 'utf-8');
  const { store, originalFileCache } = await parseRdfToGraph(original, { path: fixturePath });
  expect(originalFileCache).toBeTruthy();
  const serialize = () =>
    storeToTurtle(store, undefined, original, originalFileCache!, 'custom' as SerializerType);
  return { original, store, cache: originalFileCache!, serialize };
}

// ===========================================================================
// Group E — edges
// ===========================================================================
describe('Group E — object-property edges', () => {
  it('E1: adding an edge keeps the file in its own namespace (no default-namespace leak, no _:undefined)', async () => {
    const { store, serialize } = await load(MDF);

    // :contains exists in the fixture; add Floor --contains--> Building with cardinality.
    expect(addEdgeToStore(store, 'Floor', 'Building', 'contains', { minCardinality: 0, maxCardinality: 1 })).toBe(true);
    const out = await serialize();

    // Regression guards for the hardcoded-BASE_IRI bug:
    expect(out, 'must not leak the hardcoded default namespace').not.toContain('aec-drawing-ontology');
    expect(out, 'blank node must have a real id, not _:undefined').not.toContain('_:undefined');
    // The new restriction must reference the file's own prefixed terms.
    expect(out).toContain('owl:onProperty :contains');
    expect(out).toContain('owl:onClass :Building');
  });

  it('E2: a freshly added edge produces valid, re-parseable Turtle with the restriction intact', async () => {
    const { store, serialize } = await load(MDF);
    addEdgeToStore(store, 'Floor', 'Building', 'contains', { minCardinality: 1, maxCardinality: null });
    const out = await serialize();
    // The serialized output is valid Turtle and the new restriction survives a parse round-trip.
    const reparsed = await parseRdfToGraph(out, { path: 'reparse.ttl' });
    expect(reparsed.store).toBeTruthy();
    expect(out).toContain('owl:minQualifiedCardinality');
    // The restriction is attached to the correct class (Floor), in the file's namespace.
    const floorRestrictions = reparsed.store
      .getQuads(null, 'http://www.w3.org/2000/01/rdf-schema#subClassOf', null, null)
      .filter((q) => q.subject.value.endsWith('#Floor') && q.object.termType === 'BlankNode');
    expect(floorRestrictions.length).toBeGreaterThanOrEqual(1);
  });

  it('E3: adding then removing the same edge restores the original (semantic round-trip)', async () => {
    const { original, store, serialize } = await load(MDF);

    expect(addEdgeToStore(store, 'Floor', 'Building', 'contains', { minCardinality: 0, maxCardinality: 1 })).toBe(true);
    // removeEdgeFromStore removes the restriction AND the domain/range it added.
    removeEdgeFromStore(store, 'Floor', 'Building', 'contains');
    const out = await serialize();

    // Back to the original modulo attribution churn.
    expect(
      isAttributionOnlyChange(original, out) || changedLineCount(original, out) === 0,
      `add+remove edge did not restore original:\n${formatDiff(original, out)}`
    ).toBe(true);
  });

  it.skip('E4 (known limitation): adding an edge to a class with an existing restriction should not reflow its subClassOf list', async () => {
    // CURRENT BEHAVIOUR: editing a class that already carries an inline owl:Restriction
    // re-serializes the whole block, collapsing its multi-line rdfs:subClassOf list onto one
    // line and re-ordering restriction properties. Correctness is fine (valid, re-parseable),
    // but it is not a minimal diff. Fixing requires per-property preservation within edited
    // restriction-bearing blocks. Tracked as future work.
    const { original, store, serialize } = await load(AEC);
    addEdgeToStore(store, 'Detail', 'Note', 'contains', { minCardinality: 0, maxCardinality: 1 });
    const out = await serialize();
    expect(changedLineCount(original, out)).toBeLessThanOrEqual(3);
  });
});

// ===========================================================================
// Group F — round-trip idempotency
// ===========================================================================
describe('Group F — round-trip idempotency', () => {
  /** Serialize a store against a given original+path using the custom serializer. */
  async function reSerialize(content: string, path: string, mutate: (store: import('n3').Store) => void) {
    const { store, originalFileCache } = await parseRdfToGraph(content, { path });
    mutate(store);
    return storeToTurtle(store, undefined, content, originalFileCache!, 'custom' as SerializerType);
  }

  it('F2: rename a label then rename it back reproduces the original file', async () => {
    const original = readFileSync(MDF, 'utf-8');
    // updateLabelInStore is keyed by the class local name (the URI stays ":Building" — only
    // rdfs:label changes), so the reverse edit targets the same local name "Building".
    const out1 = await reSerialize(original, MDF, (s) => updateLabelInStore(s, 'Building', 'Edifice'));
    const out2 = await reSerialize(out1, MDF, (s) => updateLabelInStore(s, 'Building', 'Building'));
    expect(
      isAttributionOnlyChange(original, out2) || changedLineCount(original, out2) === 0,
      `rename round-trip drifted:\n${formatDiff(original, out2)}`
    ).toBe(true);
  });

  it('F3: add a comment then delete it reproduces the original file', async () => {
    const original = readFileSync(MDF, 'utf-8');
    const out1 = await reSerialize(original, MDF, (s) => updateCommentInStore(s, 'Floor', 'A level.'));
    const out2 = await reSerialize(out1, MDF, (s) => updateCommentInStore(s, 'Floor', null));
    expect(
      isAttributionOnlyChange(original, out2) || changedLineCount(original, out2) === 0,
      `comment round-trip drifted:\n${formatDiff(original, out2)}`
    ).toBe(true);
  });

  it('F4: add a class then delete it reproduces the original file', async () => {
    const original = readFileSync(MDF, 'utf-8');
    const out1 = await reSerialize(original, MDF, (s) => { addNodeToStore(s, 'Corridor'); });
    // deriveNewNodeIdentifier camelCases "Corridor" -> "corridor".
    const out2 = await reSerialize(out1, MDF, (s) => { removeNodeFromStore(s, 'corridor'); });
    expect(
      isAttributionOnlyChange(original, out2) || changedLineCount(original, out2) === 0,
      `add/remove class round-trip drifted:\n${formatDiff(original, out2)}`
    ).toBe(true);
  });

  it('F5: each successive save is stable (no progressive drift across 3 saves)', async () => {
    const original = readFileSync(MDF, 'utf-8');
    // First edit.
    const out1 = await reSerialize(original, MDF, (s) => updateCommentInStore(s, 'Building', 'A roofed structure.'));
    // Re-save with NO further edits, twice — output must not keep changing.
    const out2 = await reSerialize(out1, MDF, () => {});
    const out3 = await reSerialize(out2, MDF, () => {});
    expect(changedLineCount(out1, out2), `save 2 drifted:\n${formatDiff(out1, out2)}`).toBe(0);
    expect(changedLineCount(out2, out3), `save 3 drifted:\n${formatDiff(out2, out3)}`).toBe(0);
  });
});
