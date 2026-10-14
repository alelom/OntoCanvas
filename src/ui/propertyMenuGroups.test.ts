import { describe, it, expect } from 'vitest';
import { groupMenuEntries, menuOrder, menuGroupKey, sortByMenuGroup, type MenuEntry } from './propertyMenuGroups';

const e = (item: string, over: Partial<MenuEntry<string>> = {}): MenuEntry<string> => ({ item, source: null, deprecated: false, ...over });

describe('groupMenuEntries (#137)', () => {
  it('lists the open ontology\'s own properties first, and the others by where they are defined', () => {
    const groups = groupMenuEntries([
      e('aprov:hasConfidence', { source: 'aprov' }),
      e('drawingTitle'),
      e('geom:unit', { source: 'geom' }),
      e('aprov:inferredAt', { source: 'aprov' }),
      e('hasScale'),
    ]);
    expect(groups.own.map((x) => x.item)).toEqual(['drawingTitle', 'hasScale']);
    expect(groups.external.map((g) => [g.source, g.entries.map((x) => x.item)])).toEqual([
      ['aprov', ['aprov:hasConfidence', 'aprov:inferredAt']],
      ['geom', ['geom:unit']],
    ]);
  });

  it('puts deprecated properties in a group of their own, whatever their source or use', () => {
    const groups = groupMenuEntries([
      e('labellableRoot', { deprecated: true }),
      e('isLabel'),
      e('ext:old', { source: 'ext', deprecated: true }),
      e('isCVATProperty', { deprecated: true, unused: true }),
    ]);
    expect(groups.own.map((x) => x.item)).toEqual(['isLabel']);
    expect(groups.external).toEqual([]);
    expect(groups.unused).toEqual([]);
    expect(groups.deprecated.map((x) => x.item)).toEqual(['labellableRoot', 'ext:old', 'isCVATProperty']);
  });

  it('puts what is used nowhere in a group of its own (annotations)', () => {
    const groups = groupMenuEntries([e('dcterms:license', { source: 'dcterms', unused: true }), e('isLabel'), e('unusedOwn', { unused: true })]);
    expect(groups.own.map((x) => x.item)).toEqual(['isLabel']);
    expect(groups.unused.map((x) => x.item)).toEqual(['unusedOwn', 'dcterms:license']);
  });
});

describe('menuOrder and menuGroupKey (#137)', () => {
  it('is the order shown: own, each source, deprecated, then the unused; it is the annotation priority order', () => {
    const groups = groupMenuEntries([e('u', { unused: true }), e('x1', { source: 'x' }), e('own1'), e('own0', { deprecated: true })]);
    expect(menuOrder(groups)).toEqual(['own1', 'x1', 'own0', 'u']);
  });

  it('names the group an entry is in, so a property is only moved within it', () => {
    expect(menuGroupKey(e('a'))).toBe('own');
    expect(menuGroupKey(e('a', { source: 'aprov' }))).toBe('external:aprov');
    expect(menuGroupKey(e('a', { source: 'aprov', unused: true }))).toBe('unused');
    expect(menuGroupKey(e('a', { unused: true, deprecated: true }))).toBe('deprecated');
  });
});

describe('sortByMenuGroup (#137)', () => {
  it('orders a mixed list by group, keeping the order within a group, so Boolean and Text stay interleaved as they were', () => {
    const entries = [e('xText', { source: 'x' }), e('ownBool'), e('uText', { unused: true }), e('ownText'), e('oldBool', { deprecated: true }), e('aBool', { source: 'a' })];
    expect(sortByMenuGroup(entries).map((x) => x.item)).toEqual(['ownBool', 'ownText', 'aBool', 'xText', 'oldBool', 'uText']);
  });

  it('gives the same order as the groups show', () => {
    const entries = [e('ownDep', { unused: true, deprecated: true }), e('ext', { unused: true, source: 's' }), e('own', { unused: true }), e('a'), e('b', { source: 't' }), e('c', { deprecated: true })];
    expect(sortByMenuGroup(entries).map((x) => x.item)).toEqual(menuOrder(groupMenuEntries(entries)));
  });
});
