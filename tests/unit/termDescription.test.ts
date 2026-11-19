/**
 * A term's description (#247): its skos:definition first, its rdfs:comment after it (or alone, when it has no definition),
 * in the user's language, then English, then untagged, then any other; every value, in a stable order.
 */
import { describe, it, expect } from 'vitest';
import { Parser, Store } from 'n3';
import { describeTerm, orderLiterals, readTermDescription, setComment } from '../../src/ontology/termDescription';

const PREFIXES = `@prefix : <http://example.org/o#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> . @prefix skos: <http://www.w3.org/2004/02/skos/core#> . @prefix owl: <http://www.w3.org/2002/07/owl#> .`;
const SUBJECT = 'http://example.org/o#Wall';

function storeOf(body: string): Store {
  const store = new Store();
  store.addQuads(new Parser().parse(`${PREFIXES}\n${body}`));
  return store;
}

describe('orderLiterals', () => {
  const lits = (...items: [string, string][]) => items.map(([value, language]) => ({ value, language }));

  it('orders the display language, then English, then untagged, then any other', () => {
    const ordered = orderLiterals(lits(['Mur', 'fr'], ['Plain', ''], ['Wall', 'en'], ['Wand', 'de']), 'de');
    expect(ordered).toEqual(['Wand', 'Wall', 'Plain', 'Mur']);
  });

  it('takes a regional tag for its language, either way round', () => {
    expect(orderLiterals(lits(['Wall', 'en'], ['Mur canadien', 'fr-CA']), 'fr')).toEqual(['Mur canadien', 'Wall']);
    expect(orderLiterals(lits(['Wall', 'en'], ['Mur', 'fr']), 'fr-CA')).toEqual(['Mur', 'Wall']);
  });

  it('ignores the case of a language tag', () => {
    expect(orderLiterals(lits(['Wall', 'EN-gb'], ['Plain', '']), 'en')).toEqual(['Wall', 'Plain']);
  });

  it('puts values of one language in alphabetical order, and other languages after, by tag then text', () => {
    expect(orderLiterals(lits(['b', 'en'], ['a', 'en'], ['z', 'it'], ['y', 'es'], ['x', 'es']), 'en')).toEqual(['a', 'b', 'x', 'y', 'z']);
  });

  it('keeps a value once, whatever order it came in', () => {
    expect(orderLiterals(lits(['Wall', 'en'], ['Wall', 'en'], ['Wall', '']), 'en')).toEqual(['Wall']);
    expect(orderLiterals(lits(['a', 'en'], ['b', 'en']), 'en')).toEqual(orderLiterals(lits(['b', 'en'], ['a', 'en']), 'en'));
  });
});

describe('readTermDescription', () => {
  it('reads the definitions and the comments apart', () => {
    const store = storeOf(`:Wall a owl:Class ; skos:definition "A vertical structure." ; rdfs:comment "Corresponds to the standard's wall." .`);
    expect(readTermDescription(store, SUBJECT, 'en')).toEqual({
      definitions: ['A vertical structure.'],
      comments: ["Corresponds to the standard's wall."],
    });
  });

  it('reads each by the language rule, separately', () => {
    const store = storeOf(`:Wall a owl:Class ;
      skos:definition "Mur."@fr, "Wall."@en, "Plain." ;
      rdfs:comment "Remarque."@fr, "Note."@en .`);
    expect(readTermDescription(store, SUBJECT, 'fr')).toEqual({ definitions: ['Mur.', 'Wall.', 'Plain.'], comments: ['Remarque.', 'Note.'] });
  });

  it('is empty for a term with neither', () => {
    expect(readTermDescription(storeOf(`:Wall a owl:Class .`), SUBJECT, 'en')).toEqual({ definitions: [], comments: [] });
  });

  it('ignores a value that is not a literal', () => {
    const store = storeOf(`:Wall a owl:Class ; skos:definition :Other ; rdfs:comment "Kept." .`);
    expect(readTermDescription(store, SUBJECT, 'en')).toEqual({ definitions: [], comments: ['Kept.'] });
  });
});

describe('describeTerm', () => {
  const both = { definitions: ['Def A', 'Def B'], comments: ['Note A'] };

  it('shows the definitions, then the comments apart', () => {
    expect(describeTerm(both, undefined, true)).toEqual({ text: 'Def A\n\nDef B', comment: 'Note A' });
  });

  it('leaves the comments out when the setting is off', () => {
    expect(describeTerm(both, undefined, false)).toEqual({ text: 'Def A\n\nDef B', comment: '' });
  });

  it('falls back to the comments as the description when there is no definition, setting on or off', () => {
    const onlyComments = { definitions: [], comments: ['Note A', 'Note B'] };
    expect(describeTerm(onlyComments, undefined, true)).toEqual({ text: 'Note A\n\nNote B', comment: '' });
    expect(describeTerm(onlyComments, undefined, false)).toEqual({ text: 'Note A\n\nNote B', comment: '' });
  });

  it('uses the plain comment of a term that carries no description of its own', () => {
    expect(describeTerm(undefined, 'Imported note', true)).toEqual({ text: 'Imported note', comment: '' });
    expect(describeTerm(undefined, undefined, true)).toEqual({ text: '', comment: '' });
  });
});

describe('setComment', () => {
  it('sets the comment the dialogs edit, and the comments of the description with it, leaving the definitions', () => {
    const term: { comment?: string | null; description?: { definitions: string[]; comments: string[] } } = {
      comment: 'Old',
      description: { definitions: ['Def'], comments: ['Old', 'Second'] },
    };
    setComment(term, 'New');
    expect(term).toEqual({ comment: 'New', description: { definitions: ['Def'], comments: ['New'] } });
    setComment(term, '');
    expect(term).toEqual({ comment: undefined, description: { definitions: ['Def'], comments: [] } });
  });

  it('leaves a term with no description without one', () => {
    const term: { comment?: string | null } = {};
    setComment(term, 'Note');
    expect(term).toEqual({ comment: 'Note' });
  });
});
