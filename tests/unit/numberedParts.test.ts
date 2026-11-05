/**
 * Datasets split into numbered parts (#225): the parts added are grouped by their name, and the numbers that may be missing are
 * told. A browser cannot see the files next to one the user picked, so this can only tell the user.
 */
import { describe, it, expect } from 'vitest';
import { findPartGroups, partsNotice } from '../../src/sparql/numberedParts';

describe('findPartGroups', () => {
  it('groups part-NNNN files by name, a part compressed or not being the same part', () => {
    expect(findPartGroups(['part-0001.nq.gz', 'part-0002.nq', 'people.ttl'])).toEqual([
      { name: 'part-N.nq', numbers: [1, 2], total: null, missing: [], moreMayExist: true },
    ]);
  });

  it('finds the gaps in the numbers, from 1', () => {
    expect(findPartGroups(['part-0001.nq.gz', 'part-0002.nq.gz', 'part-0004.nq.gz'])[0]).toMatchObject({ numbers: [1, 2, 4], missing: [3] });
    expect(findPartGroups(['part-0002.nq.gz'])[0]).toMatchObject({ numbers: [2], missing: [1], moreMayExist: true });
  });

  it('counts from 0 when there is a part 0', () => {
    expect(findPartGroups(['part-0000.nq', 'part-0002.nq'])[0]).toMatchObject({ missing: [1] });
  });

  it('knows the total from NNNN-of-NNNN names, so it says exactly what is missing, and nothing when all are there', () => {
    expect(findPartGroups(['data-0001-of-0003.ttl', 'data-0003-of-0003.ttl'])[0]).toMatchObject({ total: 3, missing: [2], moreMayExist: false });
    expect(findPartGroups(['data-1-of-2.ttl', 'data-2-of-2.ttl'])[0]).toMatchObject({ missing: [], moreMayExist: false });
  });

  it('reads name.partNN, and keeps datasets with different names apart', () => {
    const groups = findPartGroups(['run.part01.trig', 'run.part03.trig', 'other-part-2.nq']);

    expect(groups.map((g) => [g.name, g.missing])).toEqual([
      ['run.partN.trig', [2]],
      ['other-part-N.nq', [1]],
    ]);
  });

  it('finds nothing in names with no part number', () => {
    expect(findPartGroups(['people.ttl', 'data-2024.ttl', 'v2.nq'])).toEqual([]);
  });
});

describe('partsNotice', () => {
  it('says which parts may be missing, and that more may follow, for a gap', () => {
    expect(partsNotice(findPartGroups(['part-0001.nq.gz', 'part-0002.nq.gz', 'part-0004.nq.gz']))).toEqual({
      strong: true,
      text: 'This looks like part of a dataset split into numbered parts (part-N.nq): part 3, and any after 4, may be missing. Add them, if they exist.',
    });
  });

  it('says so for a single part, which can never be known to be the whole', () => {
    expect(partsNotice(findPartGroups(['part-0002.nq.gz']))!.text).toContain('part 1, and any after 2, may be missing');
  });

  it('is softer when the parts run from the first with no gap: there may be more', () => {
    expect(partsNotice(findPartGroups(['part-0001.nq', 'part-0002.nq', 'part-0003.nq']))).toEqual({
      strong: false,
      text: 'Parts 1 to 3 of a dataset split into numbered parts (part-N.nq) are added. There may be more: add them, if they exist.',
    });
  });

  it('names exactly what is missing when the total is known, and says nothing when all the parts are there', () => {
    expect(partsNotice(findPartGroups(['d-1-of-4.ttl', 'd-3-of-4.ttl']))!.text).toContain('parts 2 and 4 of 4 are missing');
    expect(partsNotice(findPartGroups(['d-1-of-2.ttl', 'd-2-of-2.ttl']))).toBeNull();
    expect(partsNotice([])).toBeNull();
  });

  it('lists several missing parts in words', () => {
    expect(partsNotice(findPartGroups(['part-1.nq', 'part-5.nq']))!.text).toContain('parts 2, 3 and 4, and any after 5, may be missing');
  });
});
