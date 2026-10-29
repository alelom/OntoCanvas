// @vitest-environment jsdom
/**
 * The identifier an edit dialog shows (#146): the real IRI of an existing term, not a name made up from its label; a name
 * made up from the label only for a term about to be created, or one a changed label is about to rename.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Store, DataFactory } from 'n3';
import { classIdentifierLine, propertyIdentifierLine } from '../../src/lib/identifierDisplay';
import { deriveNewNodeIdentifier, addNodeToStore } from '../../src/ontology/editClasses';
import { editNodeProperties } from '../../src/workflows/editNodeProperties';
import { updateIdentifierDisplay } from '../../src/ui/nodeModalForm';
import { RDF, RDFS, OWL } from '../../src/ontology/vocab';
import type { GraphNode } from '../../src/types';

const NS = 'http://example.org/aec#';
const { namedNode, literal } = DataFactory;

/** A store with `:LayoutNoMention` labelled "Layout number mention", `:DrawingElement` and `:Sheet`. */
function store(): Store {
  const s = new Store();
  const cls = (name: string, label: string) => {
    s.addQuad(namedNode(NS + name), namedNode(RDF + 'type'), namedNode(OWL + 'Class'));
    s.addQuad(namedNode(NS + name), namedNode(RDFS + 'label'), literal(label));
  };
  s.addQuad(namedNode('http://example.org/aec'), namedNode(RDF + 'type'), namedNode(OWL + 'Ontology'));
  cls('LayoutNoMention', 'Layout number mention');
  cls('DrawingElement', 'Drawing element');
  cls('Sheet', 'Sheet');
  return s;
}

describe('the identifier of an existing class', () => {
  it('is its real IRI, whatever its label says', () => {
    expect(classIdentifierLine(store(), 'LayoutNoMention')).toEqual({ caption: 'Identifier:', text: NS + 'LayoutNoMention' });
  });

  it('is shown in the dialog as that IRI, with a caption that does not say it is derived from the label', () => {
    document.body.innerHTML = '<p id="renameIdentifierLabel">Identifier (derived from label):</p><p id="renameIdentifier"></p>';

    updateIdentifierDisplay('rename', 'Layout number mention', store(), 'LayoutNoMention');

    expect(document.getElementById('renameIdentifier')!.textContent).toBe(NS + 'LayoutNoMention');
    expect(document.getElementById('renameIdentifierLabel')!.textContent).toBe('Identifier:');
  });

  it('does not change as the label is typed: a label edit never changes the IRI of a class', () => {
    document.body.innerHTML = '<p id="renameIdentifierLabel"></p><p id="renameIdentifier"></p>';

    updateIdentifierDisplay('rename', 'Something else entirely', store(), 'LayoutNoMention');

    expect(document.getElementById('renameIdentifier')!.textContent).toBe(NS + 'LayoutNoMention');
  });
});

describe('the identifier of a class about to be created', () => {
  it('is UpperCamelCase, as OWL class names are', () => {
    expect(deriveNewNodeIdentifier('Drawing element')).toBe('DrawingElement');
    expect(deriveNewNodeIdentifier('layout number mention')).toBe('LayoutNumberMention');
    expect(deriveNewNodeIdentifier('assertedBy')).toBe('AssertedBy');
  });

  it('falls back to NewClass for a label that makes no identifier', () => {
    expect(deriveNewNodeIdentifier('???')).toBe('NewClass');
  });

  it('is the name addNodeToStore gives the class, so the dialog and the store agree', () => {
    const s = store();

    expect(addNodeToStore(s, 'Wall segment')).toBe('WallSegment');
    expect(s.getQuads(namedNode(NS + 'WallSegment'), namedNode(RDF + 'type'), namedNode(OWL + 'Class'), null)).toHaveLength(1);
  });

  it('is shown in the add dialog as the derived name', () => {
    document.body.innerHTML = '<p id="addNodeIdentifier"></p>';

    updateIdentifierDisplay('addNode', 'Drawing element two', store());

    expect(document.getElementById('addNodeIdentifier')!.textContent).toBe(NS + 'DrawingElementTwo');
  });
});

describe('the identifier of an existing property', () => {
  const iri = NS + 'hasPart';

  it('is its real IRI while the label is untouched', () => {
    expect(propertyIdentifierLine({ iri, originalLabel: 'has part', newLabel: 'has part' })).toEqual({ caption: 'Identifier:', text: iri });
  });

  it('stays the real IRI when the label differs from the name but was not edited (a label that is not the name camelCased)', () => {
    expect(propertyIdentifierLine({ iri, originalLabel: 'Includes', newLabel: 'Includes' }).text).toBe(iri);
  });

  it('is announced as the name it will become once the label is changed, in the property\'s own namespace', () => {
    expect(propertyIdentifierLine({ iri, originalLabel: 'has part', newLabel: 'contains part' })).toEqual({
      caption: 'Identifier (will become):',
      text: NS + 'containsPart',
    });
  });

  it('is the real IRI when the changed label gives the name it already has', () => {
    expect(propertyIdentifierLine({ iri, originalLabel: 'Includes', newLabel: 'has part' })).toEqual({ caption: 'Identifier:', text: iri });
  });

  it('is the real IRI while the label is emptied (the dialog asks for a label instead)', () => {
    expect(propertyIdentifierLine({ iri, originalLabel: 'has part', newLabel: '  ' }).text).toBe(iri);
  });

  it('follows a property with no label: any label typed is a change', () => {
    expect(propertyIdentifierLine({ iri, originalLabel: undefined, newLabel: 'contains' }).caption).toBe('Identifier (will become):');
  });
});

describe('renaming a class (its label)', () => {
  const node = (id: string, label: string): GraphNode => ({ id, label }) as GraphNode;
  const formData = { comment: '', annotationValues: {}, dataPropertyRestrictions: [] };

  it('is no longer blocked because the label would derive the name of another class: the IRI does not change', () => {
    const s = store();
    const n = node('DrawingElement', 'Drawing element');

    const result = editNodeProperties({ store: s, nodeId: 'DrawingElement', node: n, newLabel: 'Sheet', formData, annotationProperties: [] });

    expect(result.success).toBe(true);
    expect(n.label).toBe('Sheet');
    expect(s.getQuads(namedNode(NS + 'DrawingElement'), namedNode(RDFS + 'label'), null, null).map((q) => q.object.value)).toEqual(['Sheet']);
  });
});

beforeEach(() => {
  document.body.innerHTML = '';
});
