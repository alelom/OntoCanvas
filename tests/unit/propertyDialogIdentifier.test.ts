// @vitest-environment jsdom
/**
 * The identifier line of the Edit object property and Edit data property dialogs (#146): the property's real IRI until the
 * label is changed to one that gives it another name.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { updateEditRelTypeIdentifierAndValidation } from '../../src/ui/relationshipTypeForm';
import { updateEditDataPropIdentifierAndValidation } from '../../src/ui/dataPropertyForm';
import { session } from '../../src/state/appState';
import type { DataPropertyInfo, ObjectPropertyInfo } from '../../src/types';

const NS = 'http://example.org/aec#';

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
