/**
 * The small line above the label of a class or relationship defined in another ontology (#111):
 * "(defined by: <prefix>)" when the defining ontology has a prefix, "(imported)" otherwise. It is drawn with
 * vis-network's HTML multi-font, so the label's own text must be escaped, and the node/edge font gets a
 * smaller "ital" font for the note.
 */
import { describe, it, expect } from 'vitest';
import {
  importedNoteText,
  importedNoteFontSize,
  escapeLabelMarkup,
  labelWithImportedNote,
  importedNoteFont,
  isImportedRelationshipType,
  importedNoteForNode,
  importedNoteForRelationship,
  importedNoteForDataProperty,
  ontologyDisplayName,
  namespaceOf,
  importedNoteWrapChars,
} from '../../src/ui/importedNote';
import { estimateNodeDimensions } from '../../src/graph';
import { OWL_THING_URI } from '../../src/graph/thingNode';

describe('importedNoteText', () => {
  it('names the prefix of the defining ontology when it has one', () => {
    expect(importedNoteText('base')).toBe('(defined by: base)');
    expect(importedNoteText('base', 'http://example.org/base')).toBe('(defined by: base)');
  });
  it("names the ontology itself, from its IRI, when it has no prefix: always 'defined by'", () => {
    expect(importedNoteText(null, 'http://example.org/examples/other-ontology')).toBe('(defined by: other-ontology)');
    expect(importedNoteText('', 'https://w3id.org/dano#')).toBe('(defined by: dano)');
  });
  it('says "imported" only when nothing is known about the ontology', () => {
    expect(importedNoteText(null)).toBe('(imported)');
    expect(importedNoteText(undefined, null)).toBe('(imported)');
  });
});

describe('ontologyDisplayName and namespaceOf', () => {
  it('uses the last path segment without a file extension, else the host', () => {
    expect(ontologyDisplayName('http://example.org/base')).toBe('base');
    expect(ontologyDisplayName('https://w3id.org/adiro/aec_geometry.html')).toBe('aec_geometry');
    expect(ontologyDisplayName('http://www.w3.org/2002/07/owl#')).toBe('owl');
    expect(ontologyDisplayName('https://example.org/')).toBe('example.org');
    expect(ontologyDisplayName('not a url')).toBe('not a url');
  });
  it('takes the namespace of a term up to its # or last /', () => {
    expect(namespaceOf('http://example.org/base#hasProperty')).toBe('http://example.org/base');
    expect(namespaceOf('http://example.org/vocab/term')).toBe('http://example.org/vocab');
  });
});

describe('reserved-vocabulary terms (owl, rdf, rdfs, xsd) get no note: the languages define them', () => {
  const refs = [{ url: 'http://www.w3.org/2000/01/rdf-schema', usePrefix: true, prefix: 'rdfs' }];
  const main = 'http://example.org/main#';
  it('for classes, relationships and data properties', () => {
    const external = (id: string, url: string) => ({ id, label: 'X', labellableRoot: null, isExternal: true, externalOntologyUrl: url });
    expect(importedNoteForNode(external('http://www.w3.org/2000/01/rdf-schema#Resource', 'http://www.w3.org/2000/01/rdf-schema'), refs, main)).toBeNull();
    expect(importedNoteForNode(external('http://www.w3.org/2001/XMLSchema#string', 'http://www.w3.org/2001/XMLSchema'), refs, main)).toBeNull();
    // Another W3C vocabulary is not reserved, and says where it comes from.
    expect(importedNoteForNode(external('http://www.w3.org/2004/02/skos/core#Concept', 'http://www.w3.org/2004/02/skos/core'), refs, main)).toBe('(defined by: core)');
    expect(importedNoteForRelationship('http://www.w3.org/2000/01/rdf-schema#seeAlso', [], refs, main)).toBeNull();
    expect(importedNoteForDataProperty({ uri: 'http://www.w3.org/2000/01/rdf-schema#label', isDefinedBy: 'http://www.w3.org/2000/01/rdf-schema' }, refs, main)).toBeNull();
  });
});

describe('importedNoteFontSize', () => {
  it('is smaller than the label font, and never unreadably small', () => {
    expect(importedNoteFontSize(40)).toBeLessThan(40);
    expect(importedNoteFontSize(40)).toBeGreaterThan(importedNoteFontSize(20));
    expect(importedNoteFontSize(8)).toBeGreaterThanOrEqual(7);
  });
});

describe('escapeLabelMarkup', () => {
  it('escapes what the HTML multi-font would read as markup', () => {
    expect(escapeLabelMarkup('a < b & c > <b>d</b>')).toBe('a &lt; b &amp; c &gt; &lt;b&gt;d&lt;/b&gt;');
    expect(escapeLabelMarkup('plain')).toBe('plain');
  });
});

describe('labelWithImportedNote', () => {
  it('puts the note on its own line above the escaped label, keeping the label\'s own line breaks', () => {
    expect(labelWithImportedNote('Base\nClass', '(defined by: base)')).toContain('\nBase\nClass');
    expect(labelWithImportedNote('R&D <x>', '(imported)')).toBe('<code>(imported)</code>\nR&amp;D &lt;x&gt;');
  });

  it('sets the prefix or ontology name in italics, apart from the plain "(defined by: " and ")"', () => {
    expect(labelWithImportedNote('Base', '(defined by: base)')).toBe('<code>(defined by: </code><i>base</i><code>)</code>\nBase');
    expect(labelWithImportedNote('X', '(defined by: a<b>)')).toBe('<code>(defined by: </code><i>a&lt;b&gt;</i><code>)</code>\nX');
  });
});

describe('wrapping the note like the label, so it does not make the node wider', () => {
  it('breaks a note longer than the budget at its spaces, keeping the name in italics', () => {
    expect(labelWithImportedNote('Base', '(defined by: imported-note-other)', 24)).toBe(
      '<code>(defined by:</code>\n<i>imported-note-other</i><code>)</code>\nBase'
    );
  });

  it('keeps a note that fits on one line, and does not wrap without a budget', () => {
    const one = '<code>(defined by: </code><i>base</i><code>)</code>\nBase';
    expect(labelWithImportedNote('Base', '(defined by: base)', 24)).toBe(one);
    expect(labelWithImportedNote('Base', '(defined by: base)')).toBe(one);
    expect(labelWithImportedNote('Base', '(defined by: imported-note-other)')).toContain('<code>(defined by: </code>');
  });

  it('breaks inside a name of several words, each line keeping its italics', () => {
    expect(labelWithImportedNote('X', '(defined by: Friend of a Friend)', 16)).toBe(
      '<code>(defined by:</code>\n<i>Friend of a</i>\n<i>Friend</i><code>)</code>\nX'
    );
  });

  it("gives the note as many characters as the label's width holds at the note's smaller font", () => {
    // 12 characters of a 20px label are as wide as 24 of a 10px note.
    expect(importedNoteWrapChars(12, 20)).toBe(24);
    expect(importedNoteWrapChars(12, 40)).toBe(24);
    expect(importedNoteWrapChars(0, 20)).toBe(0);
  });
});

describe('importedNoteFont', () => {
  it('turns on the HTML multi-font and gives the note a smaller monospace font in the label colour, italic for the name', () => {
    const font = importedNoteFont(40, '#445');
    const size = importedNoteFontSize(40);
    expect(font).toMatchObject({ multi: 'html', mono: { size, color: '#445', mod: '' }, ital: { size, color: '#445', mod: 'italic' } });
    for (const f of [font.mono, font.ital]) {
      expect(f.face).toMatch(/Consolas/);
      expect(f.face).toMatch(/monospace/);
    }
    // vis-network lowers its mono font by 2px by default, which leaves the italic name looking raised.
    expect(font.mono.vadjust).toBe(0);
    expect(font.ital.vadjust).toBe(0);
  });
});

describe('isImportedRelationshipType', () => {
  it('is true for an object property named by a full IRI, as other ontologies\' properties are', () => {
    expect(isImportedRelationshipType('http://example.org/base#hasProperty')).toBe(true);
    expect(isImportedRelationshipType('https://w3id.org/dano#describes')).toBe(true);
  });
  it('is false for local names and subClassOf', () => {
    expect(isImportedRelationshipType('hasPart')).toBe(false);
    expect(isImportedRelationshipType('subClassOf')).toBe(false);
  });
});

describe('estimateNodeDimensions with a note', () => {
  it('wraps the note by the same rule, so a long one makes the node taller, not wider', () => {
    const note = { text: '(defined by: imported-note-other)', fontSize: 15 };
    const wrapped = estimateNodeDimensions('Template', 12, 30, note);
    const oneLine = estimateNodeDimensions('Template', 12, 30, { text: '(defined by: x)', fontSize: 15 });
    // 33 characters on one line would be about 327px wide; wrapped at 24 characters, "imported-note-other)" sets it.
    expect(wrapped.width).toBeLessThan(250);
    expect(wrapped.height).toBeGreaterThan(oneLine.height);
  });

  it('makes room for the extra lines, and leaves the width to the label (the note wraps instead)', () => {
    const plain = estimateNodeDimensions('Base Class', 12, 30);
    const withNote = estimateNodeDimensions('Base Class', 12, 30, { text: '(defined by: a-long-prefix)', fontSize: 16 });
    expect(withNote.height).toBeGreaterThan(plain.height);
    expect(withNote.width).toBe(plain.width);
  });
  it('is unchanged without a note', () => {
    expect(estimateNodeDimensions('Base Class', 12, 30, undefined)).toEqual(estimateNodeDimensions('Base Class', 12, 30));
  });
});

describe('importedNoteForNode and importedNoteForRelationship', () => {
  const refs = [{ url: 'http://example.org/base', usePrefix: true, prefix: 'base' }, { url: 'http://example.org/other', usePrefix: false }];
  const main = 'http://example.org/main#';

  it('names the prefix of the ontology that defines an imported class', () => {
    const node = { id: 'http://example.org/base#BaseClass', label: 'Base Class', labellableRoot: null, isExternal: true, externalOntologyUrl: 'http://example.org/base' };
    expect(importedNoteForNode(node, refs, main)).toBe('(defined by: base)');
  });

  it('names the ontology when it has no prefix', () => {
    const node = { id: 'http://example.org/other#C', label: 'C', labellableRoot: null, isExternal: true, externalOntologyUrl: 'http://example.org/other' };
    expect(importedNoteForNode(node, refs, main)).toBe('(defined by: other)');
  });

  it('marks a class declared locally but defined elsewhere (rdfs:isDefinedBy)', () => {
    const node = { id: 'Geometry', label: 'Geometry', labellableRoot: null, isDefinedBy: 'http://example.org/base', uri: 'http://example.org/main#Geometry' };
    expect(importedNoteForNode(node, refs, main)).toBe('(defined by: base)');
  });

  it('leaves a local class, and the owl:Thing node added for display, without a note', () => {
    expect(importedNoteForNode({ id: 'Local', label: 'Local', labellableRoot: null, uri: 'http://example.org/main#Local' }, refs, main)).toBeNull();
    expect(importedNoteForNode({ id: OWL_THING_URI, label: 'Thing', labellableRoot: null, isExternal: true, externalOntologyUrl: 'http://www.w3.org/2002/07/owl' }, refs, main)).toBeNull();
  });

  it('notes a relationship defined in another ontology, by its property, and not a local one or subClassOf', () => {
    const ops = [{ name: 'http://example.org/base#hasProperty', uri: 'http://example.org/base#hasProperty', label: 'has property', hasCardinality: true, isDefinedBy: 'http://example.org/base' }];
    expect(importedNoteForRelationship('http://example.org/base#hasProperty', ops, refs, main)).toBe('(defined by: base)');
    expect(importedNoteForRelationship('http://example.org/other#r', [], refs, main)).toBe('(defined by: other)');
    // A property named locally but declared rdfs:isDefinedBy another ontology is that ontology's too.
    const stub = [{ name: 'geoProp', uri: 'http://example.org/main#geoProp', label: 'geo', hasCardinality: true, isDefinedBy: 'http://example.org/base' }];
    expect(importedNoteForRelationship('geoProp', stub, refs, main)).toBe('(defined by: base)');
    expect(importedNoteForRelationship('hasPart', ops, refs, main)).toBeNull();
    expect(importedNoteForRelationship('subClassOf', ops, refs, main)).toBeNull();
  });
});

describe('terms of an ontology whose IRI ends in a slash, such as FOAF, are its own (#114)', () => {
  const foaf = 'http://xmlns.com/foaf/0.1/#'; // as getMainOntologyBase returns it
  const none: never[] = [];

  it('gives its own classes, relationships and data properties no note', () => {
    expect(importedNoteForNode({ id: 'Person', label: 'Person', labellableRoot: null, uri: 'http://xmlns.com/foaf/0.1/Person', isDefinedBy: 'http://xmlns.com/foaf/0.1/' }, none, foaf)).toBeNull();
    // Properties of a slash ontology are typed by full IRI (on purpose), which must not read as imported.
    const knows = { name: 'http://xmlns.com/foaf/0.1/knows', uri: 'http://xmlns.com/foaf/0.1/knows', label: 'knows', hasCardinality: true, isDefinedBy: 'http://xmlns.com/foaf/0.1/' };
    expect(importedNoteForRelationship('http://xmlns.com/foaf/0.1/knows', [knows], none, foaf)).toBeNull();
    expect(importedNoteForRelationship('http://xmlns.com/foaf/0.1/knows', [], none, foaf)).toBeNull();
    expect(importedNoteForDataProperty({ uri: 'http://xmlns.com/foaf/0.1/age', isDefinedBy: 'http://xmlns.com/foaf/0.1/' }, none, foaf)).toBeNull();
  });

  it('still notes the terms it takes from another ontology', () => {
    expect(importedNoteForRelationship('http://purl.org/dc/terms/creator', [], none, foaf)).toBe('(defined by: terms)');
    expect(importedNoteForNode({ id: 'http://purl.org/dc/terms/Agent', label: 'Agent', labellableRoot: null, isExternal: true, externalOntologyUrl: 'http://purl.org/dc/terms/' }, none, foaf)).toBe('(defined by: terms)');
  });
});

describe('importedNoteForDataProperty', () => {
  const refs = [{ url: 'http://example.org/data-base', usePrefix: true, prefix: 'dpbase' }];
  const main = 'http://example.org/main#';

  it('notes a data property of another ontology: by prefix, else by the ontology name', () => {
    expect(importedNoteForDataProperty({ uri: 'http://example.org/data-base#createdDate', isDefinedBy: 'http://example.org/data-base' }, refs, main)).toBe('(defined by: dpbase)');
    expect(importedNoteForDataProperty({ uri: 'http://example.org/unlisted#x', isDefinedBy: 'http://example.org/unlisted' }, refs, main)).toBe('(defined by: unlisted)');
  });

  it("leaves the loaded ontology's own data property, and an unknown one, without a note", () => {
    expect(importedNoteForDataProperty({ uri: 'http://example.org/main#age' }, refs, main)).toBeNull();
    expect(importedNoteForDataProperty(undefined, refs, main)).toBeNull();
  });
});
