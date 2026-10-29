// @vitest-environment jsdom
/**
 * The identifier line of the Edit object property and Edit data property dialogs (#146): the property's real IRI until the
 * label is changed to one that gives it another name.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Store, DataFactory } from 'n3';
import { renameObjectPropertyInStore } from '../../src/ontology/editObjectProperties';
import { renameDataPropertyInStore } from '../../src/ontology/editDataProperties';
import { RDF, RDFS, OWL } from '../../src/ontology/vocab';
import { updateEditRelTypeIdentifierAndValidation } from '../../src/ui/relationshipTypeForm';
import { updateEditDataPropIdentifierAndValidation } from '../../src/ui/dataPropertyForm';
import { session } from '../../src/state/appState';
import type { DataPropertyInfo, ObjectPropertyInfo } from '../../src/types';

const NS = 'http://example.org/aec#';
const { namedNode, literal } = DataFactory;

function dialog(html: string, id: string, dataset: Record<string, string>): void {
  document.body.innerHTML = `<div id="${id}" style="display:block">${html}</div>`;
  Object.assign(document.getElementById(id)!.dataset, dataset);
}

const shown = (id: string) => document.getElementById(id)!.textContent;

describe('Edit object property', () => {
  beforeEach(() => {
    session.ttlStore = null as never;
    session.externalOntologyReferences = [];
    session.objectProperties = [{ name: 'includes', label: 'Includes', uri: NS + 'includes' }] as ObjectPropertyInfo[];
    dialog(
      '<input id="editRelTypeLabel"><p id="editRelTypeName"></p><p id="editRelTypeIdentifier"></p><p id="editRelTypeLabelValidation"></p><button id="editRelTypeConfirm"></button>',
      'editRelationshipTypeModal',
      { type: 'includes' }
    );
  });

  const typeLabel = (value: string) => {
    (document.getElementById('editRelTypeLabel') as HTMLInputElement).value = value;
    updateEditRelTypeIdentifierAndValidation();
  };

  it('shows the real IRI for a label that is not the name camelCased, as long as the label is as it was', () => {
    typeLabel('Includes');

    expect(shown('editRelTypeIdentifier')).toBe(NS + 'includes');
    expect(shown('editRelTypeName')).toBe('Identifier:');
  });

  it('announces the name the property will get once the label is changed', () => {
    typeLabel('Contains part');

    expect(shown('editRelTypeIdentifier')).toBe(NS + 'containsPart');
    expect(shown('editRelTypeName')).toBe('Identifier (will become):');
  });

  it('goes back to the real IRI when the label is put back', () => {
    typeLabel('Contains part');
    typeLabel('Includes');

    expect(shown('editRelTypeIdentifier')).toBe(NS + 'includes');
    expect(shown('editRelTypeName')).toBe('Identifier:');
  });
});

describe('Edit data property', () => {
  beforeEach(() => {
    session.ttlStore = null as never;
    session.externalOntologyReferences = [];
    session.dataProperties = [{ name: 'createdOn', label: 'Date created', uri: NS + 'createdOn' }] as DataPropertyInfo[];
    dialog(
      '<input id="editDataPropLabel"><input id="editDataPropDefinedBy"><p id="editDataPropName"></p><p id="editDataPropIdentifier"></p><p id="editDataPropLabelValidation"></p><button id="editDataPropConfirm"></button>',
      'editDataPropertyModal',
      { dataPropName: 'createdOn' }
    );
  });

  const typeLabel = (value: string) => {
    (document.getElementById('editDataPropLabel') as HTMLInputElement).value = value;
    updateEditDataPropIdentifierAndValidation();
  };

  it('shows the real IRI while the label is untouched, though it is not the name camelCased', () => {
    typeLabel('Date created');

    expect(shown('editDataPropIdentifier')).toBe(NS + 'createdOn');
    expect(shown('editDataPropName')).toBe('Identifier:');
  });

  it('announces the new name once the label is changed', () => {
    typeLabel('Creation date');

    expect(shown('editDataPropIdentifier')).toBe(NS + 'creationDate');
    expect(shown('editDataPropName')).toBe('Identifier (will become):');
  });
});

describe('the line says what OK does when the property lives outside the ontology IRI (#202 review)', () => {
  const MAIN = 'http://example.org/main';
  const OTHER = 'http://example.org/other#';

  /** A store whose ontology IRI is not the namespace of its terms, with one local property of each kind in `OTHER`. */
  function twoNamespaceStore(): Store {
    const s = new Store();
    const add = (subject: string, predicate: string, object: string | ReturnType<typeof literal>) =>
      s.addQuad(namedNode(subject), namedNode(predicate), typeof object === 'string' ? namedNode(object) : object);
    add(MAIN, RDF + 'type', OWL + 'Ontology');
    add(OTHER + 'includes', RDF + 'type', OWL + 'ObjectProperty');
    add(OTHER + 'includes', RDFS + 'label', literal('Includes'));
    add(OTHER + 'createdOn', RDF + 'type', OWL + 'DatatypeProperty');
    add(OTHER + 'createdOn', RDFS + 'label', literal('Date created'));
    return s;
  }

  const subjectsOfType = (s: Store, type: string) => s.getQuads(null, namedNode(RDF + 'type'), namedNode(type), null).map((q) => q.subject.value);

  beforeEach(() => {
    session.externalOntologyReferences = [];
  });

  it('object property: the IRI shown is the IRI the rename writes', () => {
    const s = twoNamespaceStore();
    session.ttlStore = s;
    session.objectProperties = [{ name: 'includes', label: 'Includes', uri: OTHER + 'includes' }] as ObjectPropertyInfo[];
    dialog(
      '<input id="editRelTypeLabel"><p id="editRelTypeName"></p><p id="editRelTypeIdentifier"></p><p id="editRelTypeLabelValidation"></p><button id="editRelTypeConfirm"></button>',
      'editRelationshipTypeModal',
      { type: 'includes' }
    );
    (document.getElementById('editRelTypeLabel') as HTMLInputElement).value = 'Contains part';
    updateEditRelTypeIdentifierAndValidation();
    const shownIri = shown('editRelTypeIdentifier')!;

    renameObjectPropertyInStore(s, OTHER + 'includes', 'containsPart');

    expect(subjectsOfType(s, OWL + 'ObjectProperty')).toEqual([shownIri]);
    expect(shownIri).toBe(OTHER + 'containsPart');
  });

  it('data property: the IRI shown is the IRI the rename writes', () => {
    const s = twoNamespaceStore();
    session.ttlStore = s;
    session.dataProperties = [{ name: 'createdOn', label: 'Date created', uri: OTHER + 'createdOn' }] as DataPropertyInfo[];
    dialog(
      '<input id="editDataPropLabel"><input id="editDataPropDefinedBy"><p id="editDataPropName"></p><p id="editDataPropIdentifier"></p><p id="editDataPropLabelValidation"></p><button id="editDataPropConfirm"></button>',
      'editDataPropertyModal',
      { dataPropName: 'createdOn' }
    );
    (document.getElementById('editDataPropLabel') as HTMLInputElement).value = 'Creation date';
    updateEditDataPropIdentifierAndValidation();
    const shownIri = shown('editDataPropIdentifier')!;

    renameDataPropertyInStore(s, OTHER + 'createdOn', 'creationDate');

    expect(subjectsOfType(s, OWL + 'DatatypeProperty')).toEqual([shownIri]);
    expect(shownIri).toBe(OTHER + 'creationDate');
  });
});
