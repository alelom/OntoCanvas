import { describe, it, expect } from 'vitest';
import { buildSearchSuggestions, prefixedName, type SuggestionSource } from './searchSuggestions';

const FOAF = 'http://xmlns.com/foaf/0.1/';

describe('prefixedName (#81)', () => {
  it('writes an IRI as prefix:localName when a prefix is known, else its local name', () => {
    expect(prefixedName(`${FOAF}member`, 'foaf')).toBe('foaf:member');
    expect(prefixedName(`${FOAF}member`, null)).toBe('member');
    expect(prefixedName('http://example.org/o#hasPart', null)).toBe('hasPart');
    expect(prefixedName('hasPart', 'ex')).toBe('ex:hasPart');
  });
});

describe('buildSearchSuggestions (#81)', () => {
  const sources: SuggestionSource[] = [
    { kind: 'relationship', display: 'foaf:member', title: `${FOAF}member`, names: ['foaf:member', 'member', `${FOAF}member`] },
    { kind: 'relationship', display: 'foaf:workplaceHomepage', title: `${FOAF}workplaceHomepage`, names: ['foaf:workplaceHomepage', 'workplace homepage'] },
    { kind: 'class', display: 'Group', title: `${FOAF}Group`, names: ['Group'] },
    { kind: 'data property', display: 'foaf:yahooChatID', title: `${FOAF}yahooChatID`, names: ['foaf:yahooChatID', 'Yahoo chat ID'] },
  ];

  it('shows the prefixed name, not the full IRI, and keeps the IRI as a tooltip', () => {
    const [s] = buildSearchSuggestions('member', sources);
    expect(s).toEqual({ value: 'foaf:member', display: 'foaf:member', title: `${FOAF}member`, hint: 'relationship' });
  });

  it('includes data properties, matched by label too', () => {
    expect(buildSearchSuggestions('yahoo', sources).map((s) => [s.display, s.hint])).toEqual([['foaf:yahooChatID', 'data property']]);
    expect(buildSearchSuggestions('chat id', sources).map((s) => s.display)).toEqual(['foaf:yahooChatID']);
  });

  it('matches a relationship by its visible label', () => {
    expect(buildSearchSuggestions('workplace home', sources).map((s) => s.display)).toEqual(['foaf:workplaceHomepage']);
  });

  it('is case-insensitive, de-duplicated, and limited', () => {
    const dup: SuggestionSource[] = [...sources, { kind: 'relationship', display: 'foaf:member', title: 'x', names: ['member'] }];
    expect(buildSearchSuggestions('MEMBER', dup)).toHaveLength(1);
    expect(buildSearchSuggestions('o', sources, 2)).toHaveLength(2);
  });

  it('returns nothing for an empty query', () => {
    expect(buildSearchSuggestions('  ', sources)).toEqual([]);
  });
});
