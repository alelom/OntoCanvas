// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { recallSeenVersions, rememberSeenVersions } from './seenVersions';

const ONTO = 'http://example.org/building';
const at = (v: string) => `https://files.example.org/building-${v}.ttl`;

describe('seen versions (#133)', () => {
  beforeEach(() => sessionStorage.clear());

  it('recalls the versions listed for an ontology earlier in the tab, whatever spelling of its IRI', () => {
    rememberSeenVersions(ONTO, [
      { version: '2.0.0', url: at('2.0.0'), source: 'loaded' },
      { version: '1.0.0', url: at('1.0.0'), source: 'prior' },
    ]);
    expect(recallSeenVersions(`${ONTO}#`)).toEqual([
      { version: '2.0.0', url: at('2.0.0'), source: 'seen' },
      { version: '1.0.0', url: at('1.0.0'), source: 'seen' },
    ]);
  });

  it('adds to what was seen before, once per address, and keeps nothing without an address', () => {
    rememberSeenVersions(ONTO, [{ version: '2.0.0', url: at('2.0.0'), source: 'loaded' }]);
    rememberSeenVersions(ONTO, [{ version: '2.0.0', url: at('2.0.0'), source: 'prior' }, { version: '0.1.0', url: null, source: 'loaded' }]);
    expect(recallSeenVersions(ONTO).map((e) => e.version)).toEqual(['2.0.0']);
  });

  it('keeps each ontology apart', () => {
    rememberSeenVersions(ONTO, [{ version: '2.0.0', url: at('2.0.0'), source: 'loaded' }]);
    expect(recallSeenVersions('http://example.org/other')).toEqual([]);
  });
});
