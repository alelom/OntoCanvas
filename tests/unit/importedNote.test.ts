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
} from '../../src/ui/importedNote';
import { estimateNodeDimensions } from '../../src/graph';
import { OWL_THING_URI } from '../../src/graph/thingNode';

describe('importedNoteText', () => {
  it('names the prefix of the defining ontology when it has one', () => {
    expect(importedNoteText('base')).toBe('(defined by: base)');
  });
  it('says "imported" without a prefix', () => {
    expect(importedNoteText(null)).toBe('(imported)');
    expect(importedNoteText(undefined)).toBe('(imported)');
    expect(importedNoteText('')).toBe('(imported)');
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
    expect(labelWithImportedNote('Base\nClass', '(defined by: base)')).toBe('<i>(defined by: base)</i>\nBase\nClass');
    expect(labelWithImportedNote('R&D <x>', '(imported)')).toBe('<i>(imported)</i>\nR&amp;D &lt;x&gt;');
  });
});

describe('importedNoteFont', () => {
  it('turns on the HTML multi-font and gives the note a smaller font in the label colour', () => {
    expect(importedNoteFont(40, '#445')).toEqual({ multi: 'html', ital: { size: importedNoteFontSize(40), color: '#445', mod: '' } });
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
  it('makes room for the extra line and for a note wider than the label', () => {
    const plain = estimateNodeDimensions('Base Class', 12, 30);
    const withNote = estimateNodeDimensions('Base Class', 12, 30, { text: '(defined by: a-long-prefix)', fontSize: 16 });
    expect(withNote.height).toBeGreaterThan(plain.height);
    expect(withNote.width).toBeGreaterThan(plain.width);
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

  it('says "imported" when that ontology has no prefix', () => {
    const node = { id: 'http://example.org/other#C', label: 'C', labellableRoot: null, isExternal: true, externalOntologyUrl: 'http://example.org/other' };
    expect(importedNoteForNode(node, refs, main)).toBe('(imported)');
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
    expect(importedNoteForRelationship('http://example.org/other#r', [], refs, main)).toBe('(imported)');
    expect(importedNoteForRelationship('hasPart', ops, refs, main)).toBeNull();
    expect(importedNoteForRelationship('subClassOf', ops, refs, main)).toBeNull();
  });
});
