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

  it('puts deprecated properties after the active ones of their group', () => {
    const groups = groupMenuEntries([e('labellableRoot', { deprecated: true }), e('isLabel'), e('isOptional')]);
    expect(groups.own.map((x) => x.item)).toEqual(['isLabel', 'isOptional', 'labellableRoot']);
  });

  it('puts what is used on no class in a group of its own, last (annotations)', () => {
    const groups = groupMenuEntries([
      e('dcterms:license', { source: 'dcterms', unused: true }),
      e('isLabel'),
      e('labellableRoot', { deprecated: true, unused: true }),
      e('skos:altLabel', { source: 'skos', unused: true }),
    ]);
    expect(groups.own.map((x) => x.item)).toEqual(['isLabel']);
    expect(groups.external).toEqual([]);
    expect(groups.unused.map((x) => x.item)).toEqual(['dcterms:license', 'skos:altLabel', 'labellableRoot']);
  });

  it('says a collapsed group should start open when something in it is in effect on the canvas', () => {
    expect(groupMenuEntries([e('a'), e('b', { source: 'x' })]).externalInEffect).toBe(false);
    expect(groupMenuEntries([e('a'), e('b', { source: 'x', affectsCanvas: true })]).externalInEffect).toBe(true);
    expect(groupMenuEntries([e('a', { unused: true, affectsCanvas: true })]).unusedInEffect).toBe(true);
  });
});

describe('menuOrder and menuGroupKey (#137)', () => {
  it('is the order shown: own, then each source, then the unused; it is the annotation priority order', () => {
    const groups = groupMenuEntries([e('u', { unused: true }), e('x1', { source: 'x' }), e('own1'), e('own0', { deprecated: true })]);
    expect(menuOrder(groups)).toEqual(['own1', 'own0', 'x1', 'u']);
  });

  it('names the group an entry is in, so a property is only moved within it', () => {
    expect(menuGroupKey(e('a'))).toBe('own');
    expect(menuGroupKey(e('a', { source: 'aprov' }))).toBe('external:aprov');
    expect(menuGroupKey(e('a', { source: 'aprov', unused: true }))).toBe('unused');
  });
});

describe('sortByMenuGroup (#137)', () => {
  it('orders a mixed list by group, keeping the order within a group, so Boolean and Text stay interleaved as they were', () => {
    const entries = [e('xText', { source: 'x' }), e('ownBool'), e('uText', { unused: true }), e('ownText'), e('oldBool', { deprecated: true }), e('aBool', { source: 'a' })];
    expect(sortByMenuGroup(entries).map((x) => x.item)).toEqual(['ownBool', 'ownText', 'oldBool', 'aBool', 'xText', 'uText']);
  });

  it('gives the same order as the groups show, also for the unused group', () => {
    const entries = [e('ownDep', { unused: true, deprecated: true }), e('ext', { unused: true, source: 's' }), e('own', { unused: true }), e('a'), e('b', { source: 't' })];
    expect(sortByMenuGroup(entries).map((x) => x.item)).toEqual(menuOrder(groupMenuEntries(entries)));
  });
});
