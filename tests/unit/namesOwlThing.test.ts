/**
 * The predicate that decides "the user asked for the universal domain/range" must be one rule.
 *
 * The domain and range fields accept owl:Thing written three ways. The store writer has always
 * accepted all three; the edit-modal handler used to recognise only two, so typing the full URI
 * wrote rdfs:domain owl:Thing to the store while leaving hasGlobalDomain false and domain set to
 * the URI — and the edge-styles menu and a re-opened modal then disagreed with the file until the
 * next reparse.
 */
import { describe, it, expect } from 'vitest';
import { namesOwlThing } from '../../src/parser';

const OWL_THING_URI = 'http://www.w3.org/2002/07/owl#Thing';

describe('namesOwlThing', () => {
  it('accepts every spelling the class field offers', () => {
    expect(namesOwlThing('Thing')).toBe(true);
    expect(namesOwlThing('owl:Thing')).toBe(true);
    expect(namesOwlThing(OWL_THING_URI)).toBe(true);
  });

  it('ignores surrounding whitespace', () => {
    expect(namesOwlThing('  owl:Thing  ')).toBe(true);
    expect(namesOwlThing(` ${OWL_THING_URI}\t`)).toBe(true);
  });

  it('treats a blank field as asserting nothing', () => {
    expect(namesOwlThing('')).toBe(false);
    expect(namesOwlThing('   ')).toBe(false);
  });

  it('does not match another class that merely mentions Thing', () => {
    expect(namesOwlThing('SomeThing')).toBe(false);
    expect(namesOwlThing('http://example.org/other#Thing')).toBe(false);
  });
});
