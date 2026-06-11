/**
 * Minimal-diff contract — Group H (object-property edits) and Group I (data-property edits).
 *
 * Each edit is checked two ways:
 *   - a passing test: the intended change is applied and the output is valid/re-parseable;
 *   - a `it.skip` "KNOWN BUG" test: the strict minimal-diff property that the upcoming
 *     block-serializer refactor must satisfy. These document current breakage and become the
 *     implementation checklist (un-skip as each is fixed).
 *
 * KNOWN BUG (shared): editing a property block that is the LAST block before a section-divider
 * comment (e.g. `#### Data properties ####`) currently deletes that divider, because the
 * block-level reconstruction slices from the next block's start and discards the divider +
 * surrounding blank lines in between. Output stays valid Turtle but the section structure is lost.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  parseRdfToGraph,
  storeToTurtle,
  updateObjectPropertyLabelInStore,
  updateObjectPropertyCommentInStore,
  updateObjectPropertyDomainRangeInStore,
  updateObjectPropertySubPropertyOfInStore,
  updateDataPropertyLabelInStore,
  updateDataPropertyCommentInStore,
  updateDataPropertyRangeInStore,
  updateDataPropertyDomainsInStore,
  type SerializerType,
} from '../../../src/parser';
import { changedLineCount, formatDiff, blockUnchanged } from './minimalDiff';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MDP = join(__dirname, '../../fixtures/minimal-diff-properties-fixture.ttl');
const XSD = 'http://www.w3.org/2001/XMLSchema#';

async function setup() {
  const original = readFileSync(MDP, 'utf-8');
  const { store, originalFileCache } = await parseRdfToGraph(original, { path: MDP });
  expect(originalFileCache).toBeTruthy();
  const serialize = () =>
    storeToTurtle(store, undefined, original, originalFileCache!, 'custom' as SerializerType);
  return { original, store, serialize };
}

async function reparses(ttl: string): Promise<boolean> {
  const r = await parseRdfToGraph(ttl, { path: 'reparse.ttl' });
  return !!r.store;
}

// ===========================================================================
// Group H — object-property edits
// ===========================================================================
describe('Group H — object-property edits', () => {
  it('H1: changing an object-property label applies and stays valid', async () => {
    const { store, serialize } = await setup();
    expect(updateObjectPropertyLabelInStore(store, 'hasPart', 'contains part')).toBe(true);
    const out = await serialize();
    expect(out).toContain('rdfs:label "contains part"');
    expect(out).not.toContain('rdfs:label "has part"');
    expect(await reparses(out)).toBe(true);
  });

  it('H2: changing an object-property comment applies and stays valid', async () => {
    const { store, serialize } = await setup();
    expect(updateObjectPropertyCommentInStore(store, 'hasPart', 'Has-a relationship.')).toBe(true);
    const out = await serialize();
    expect(out).toContain('rdfs:comment "Has-a relationship."');
    expect(await reparses(out)).toBe(true);
  });

  it('H3: changing domain/range applies and stays valid', async () => {
    const { store, serialize } = await setup();
    expect(updateObjectPropertyDomainRangeInStore(store, 'hasPart', 'Zone', 'Site')).toBe(true);
    const out = await serialize();
    expect(out).toMatch(/:hasPart[\s\S]*rdfs:domain :Zone/);
    expect(out).toMatch(/:hasPart[\s\S]*rdfs:range :Site/);
    expect(await reparses(out)).toBe(true);
  });

  it('H4: setting rdfs:subPropertyOf applies and stays valid', async () => {
    const { store, serialize } = await setup();
    expect(updateObjectPropertySubPropertyOfInStore(store, 'hasPart', 'relatesTo')).toBe(true);
    const out = await serialize();
    expect(out).toContain('rdfs:subPropertyOf :relatesTo');
    expect(await reparses(out)).toBe(true);
  });

  it.skip('H-MINIMAL (KNOWN BUG): editing hasPart must not delete the following section divider', async () => {
    const { original, store, serialize } = await setup();
    updateObjectPropertyCommentInStore(store, 'hasPart', 'Has-a relationship.');
    const out = await serialize();
    // The "# Data properties" divider immediately follows :hasPart and must survive.
    expect(out, `divider lost:\n${formatDiff(original, out)}`).toContain('#    Data properties');
    // And no other block may change.
    expect(blockUnchanged(original, out, ':hasArea').equal).toBe(true);
    expect(changedLineCount(original, out)).toBeLessThanOrEqual(1);
  });
});

// ===========================================================================
// Group I — data-property edits
// ===========================================================================
describe('Group I — data-property edits', () => {
  it('I1: changing a data-property label applies and stays valid', async () => {
    const { store, serialize } = await setup();
    expect(updateDataPropertyLabelInStore(store, 'hasArea', 'area')).toBe(true);
    const out = await serialize();
    expect(out).toContain('rdfs:label "area"');
    expect(await reparses(out)).toBe(true);
  });

  it('I2: changing a data-property comment applies and stays valid', async () => {
    const { store, serialize } = await setup();
    expect(updateDataPropertyCommentInStore(store, 'hasArea', 'Net internal area.')).toBe(true);
    const out = await serialize();
    expect(out).toContain('rdfs:comment "Net internal area."');
    expect(await reparses(out)).toBe(true);
  });

  it('I3: changing a data-property range applies and stays valid', async () => {
    const { store, serialize } = await setup();
    expect(updateDataPropertyRangeInStore(store, 'hasArea', XSD + 'double')).toBe(true);
    const out = await serialize();
    expect(out).toContain('rdfs:range xsd:double');
    expect(await reparses(out)).toBe(true);
  });

  it('I4: adding a data-property domain applies and stays valid', async () => {
    const { store, serialize } = await setup();
    expect(updateDataPropertyDomainsInStore(store, 'hasArea', ['Zone', 'Site'])).toBe(true);
    const out = await serialize();
    expect(out).toMatch(/rdfs:domain :Zone, :Site|rdfs:domain :Site, :Zone/);
    expect(await reparses(out)).toBe(true);
  });

  it.skip('I-MINIMAL (KNOWN BUG): editing hasArea must not delete the following section divider', async () => {
    const { original, store, serialize } = await setup();
    updateDataPropertyRangeInStore(store, 'hasArea', XSD + 'double');
    const out = await serialize();
    // The "# Classes" divider immediately follows :hasArea and must survive.
    expect(out, `divider lost:\n${formatDiff(original, out)}`).toContain('#    Classes');
    expect(blockUnchanged(original, out, ':Site').equal).toBe(true);
    expect(changedLineCount(original, out)).toBeLessThanOrEqual(1);
  });
});
