/**
 * Minimal-diff contract — Group D: rdfs:subClassOf list & inline blank-node restriction
 * stability, plus no-edit round-trip identity.
 *
 * The user's headline complaints: "references to the rdfs:subClassOf List can be altered by
 * moving the list definition to another line" and edits "affect the file in their entirety".
 * These tests pin the inverse: editing an unrelated property of a class must leave its
 * (and every other class's) subClassOf list and inline restrictions byte-for-byte identical,
 * and a no-op save must reproduce the file exactly.
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
  type SerializerType,
} from '../../../src/parser';
import {
  changedLineCount,
  formatDiff,
  blockUnchanged,
  extractBlock,
  meaningfulLineDiff,
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

describe('Group D — subClassOf / blank-node stability', () => {
  it('D1: adding a comment leaves the class\'s own rdfs:subClassOf line untouched', async () => {
    const { original, store, serialize } = await setup(MDF);

    // :Wall has `rdfs:subClassOf :Building` and no comment — add one.
    expect(updateCommentInStore(store, 'Wall', 'A vertical partition.')).toBe(true);
    const out = await serialize();

    expect(out).toContain('rdfs:comment "A vertical partition."');
    // The subClassOf line within :Wall must be present verbatim.
    const wallBlock = extractBlock(out, ':Wall');
    expect(wallBlock).toContain('rdfs:subClassOf :Building ;');
    // The typed boolean must not be normalized.
    expect(wallBlock).toContain(':labellableRoot "false"^^xsd:boolean');
  });

  it('D2: editing a label keeps the inline blank-node restriction byte-identical', async () => {
    const { original, store, serialize } = await setup(MDF);

    // :Room owns an inline owl:Restriction. Rename its label and assert the restriction text is intact.
    expect(updateLabelInStore(store, 'Room', 'Bedroom')).toBe(true);
    const out = await serialize();

    const roomBefore = extractBlock(original, ':Room')!;
    const roomAfter = extractBlock(out, ':Room')!;

    // Everything in the :Room block except the label line must be identical.
    const restrictionLine =
      '        [ rdf:type owl:Restriction ; owl:onProperty :contains ; owl:onClass :Building ; owl:qualifiedCardinality "1"^^xsd:nonNegativeInteger ] ;';
    expect(roomBefore).toContain(restrictionLine);
    expect(roomAfter).toContain(restrictionLine);
    expect(roomAfter).toContain('rdfs:subClassOf :Floor,');
    // The blank node must stay inline (no expansion to a separate _:b node / named node).
    expect(roomAfter).not.toMatch(/_:/);
  });

  it('D3: editing one class does not move or reflow another class\'s subClassOf list', async () => {
    const { original, store, serialize } = await setup(MDF);

    // Edit :Building's label; :Room and :Wall (both have subClassOf) must be untouched.
    expect(updateLabelInStore(store, 'Building', 'Edifice')).toBe(true);
    const out = await serialize();

    for (const subj of [':Room', ':Wall']) {
      const r = blockUnchanged(original, out, subj);
      expect(r.equal, `${subj} block changed:\n--- before ---\n${r.before}\n--- after ---\n${r.after}`).toBe(true);
    }
  });

  it('D4: no-edit round-trip reproduces the file exactly (MDF)', async () => {
    const { original, serialize } = await setup(MDF);
    const out = await serialize();
    expect(changedLineCount(original, out), `no-op save changed the file:\n${formatDiff(original, out)}`).toBe(0);
  });

  it('D4b: no-edit round-trip reproduces the file exactly (real-world AEC)', async () => {
    const { original, serialize } = await setup(AEC);
    const out = await serialize();
    const churn = changedLineCount(original, out);
    // Allow only attribution-comment churn, if any (version line is rewritten on save).
    const d = meaningfulLineDiff(original, out);
    const nonAttribution = [...d.added, ...d.removed].filter(
      (l) => !/Created\/edited with https:\/\/alelom\.github\.io\/OntoCanvas\//.test(l)
    );
    expect(nonAttribution, `no-op save changed non-attribution lines:\n${formatDiff(original, out)}`).toEqual([]);
    expect(churn).toBeLessThanOrEqual(2);
  });
});
