/**
 * Unit tests for removing external class references from the store.
 */
import { describe, it, expect } from 'vitest';
import { Store, DataFactory } from 'n3';
import {
  getQuadsRemovedForExternalClass,
  removeExternalClassReferencesFromStore,
} from './removeExternalReferences';

const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';
const PM = 'http://example.org/project-mgmt#';
const TA = 'http://example.org/task-assignment#';

describe('removeExternalClassReferencesFromStore', () => {
  it('removes rdfs:range and rdfs:domain quads that reference the external class', () => {
    const store = new Store();
    const assignedTo = DataFactory.namedNode(TA + 'assignedTo');
    const task = DataFactory.namedNode(TA + 'Task');
    const person = DataFactory.namedNode(PM + 'Person');
    store.addQuad(assignedTo, DataFactory.namedNode(RDFS + 'domain'), task);
    store.addQuad(assignedTo, DataFactory.namedNode(RDFS + 'range'), person);

    removeExternalClassReferencesFromStore(store, PM + 'Person');

    const rangeQuads = store.getQuads(assignedTo, DataFactory.namedNode(RDFS + 'range'), null, null);
    const domainQuads = store.getQuads(assignedTo, DataFactory.namedNode(RDFS + 'domain'), null, null);
    expect(rangeQuads.length).toBe(0);
    expect(domainQuads.length).toBe(1);
    expect((domainQuads[0].object as { value: string }).value).toBe(TA + 'Task');
  });

  it('removes restriction subClassOf when someValuesFrom points to external class', () => {
    const store = new Store();
    const task = DataFactory.namedNode(TA + 'Task');
    const person = DataFactory.namedNode(PM + 'Person');
    const blank = DataFactory.blankNode('b1');
    store.addQuad(task, DataFactory.namedNode(RDFS + 'subClassOf'), blank);
    store.addQuad(blank, DataFactory.namedNode(OWL + 'onProperty'), DataFactory.namedNode(TA + 'assignedTo'));
    store.addQuad(blank, DataFactory.namedNode(OWL + 'someValuesFrom'), person);

    removeExternalClassReferencesFromStore(store, PM + 'Person');

    const subClassQuads = store.getQuads(task, DataFactory.namedNode(RDFS + 'subClassOf'), null, null);
    expect(subClassQuads.length).toBe(0);
  });
});

describe('getQuadsRemovedForExternalClass', () => {
  it('returns domain/range quads for the external class without removing them', () => {
    const store = new Store();
    const assignedTo = DataFactory.namedNode(TA + 'assignedTo');
    const task = DataFactory.namedNode(TA + 'Task');
    const person = DataFactory.namedNode(PM + 'Person');
    store.addQuad(assignedTo, DataFactory.namedNode(RDFS + 'domain'), task);
    store.addQuad(assignedTo, DataFactory.namedNode(RDFS + 'range'), person);

    const quads = getQuadsRemovedForExternalClass(store, PM + 'Person');

    expect(quads.length).toBe(1);
    expect((quads[0].object as { value: string }).value).toBe(PM + 'Person');
    const rangeQuads = store.getQuads(assignedTo, DataFactory.namedNode(RDFS + 'range'), null, null);
    expect(rangeQuads.length).toBe(1);
  });
});

describe('getQuadsRemovedForExternalClass and removal', () => {
  it('adding back the quads it returns restores the store', () => {
    const store = new Store();
    const assignedTo = DataFactory.namedNode(TA + 'assignedTo');
    const task = DataFactory.namedNode(TA + 'Task');
    const person = DataFactory.namedNode(PM + 'Person');
    store.addQuad(assignedTo, DataFactory.namedNode(RDFS + 'domain'), task);
    store.addQuad(assignedTo, DataFactory.namedNode(RDFS + 'range'), person);

    const quadsToRestore = getQuadsRemovedForExternalClass(store, PM + 'Person');
    removeExternalClassReferencesFromStore(store, PM + 'Person');
    expect(store.getQuads(null, null, null, null).length).toBe(1);

    store.addQuads(quadsToRestore);
    const rangeQuads = store.getQuads(assignedTo, DataFactory.namedNode(RDFS + 'range'), null, null);
    expect(rangeQuads.length).toBe(1);
    expect((rangeQuads[0].object as { value: string }).value).toBe(PM + 'Person');
  });
});

describe('restrictions drawn as edges to an external class (#99 review)', () => {
  // Every restriction the expansion draws to an external class must be removable, or applyFilter redraws it.
  const build = () => {
    const store = new Store();
    const task = DataFactory.namedNode(TA + 'Task');
    const blank = DataFactory.blankNode('only1');
    store.addQuad(task, DataFactory.namedNode(RDFS + 'subClassOf'), blank);
    store.addQuad(blank, DataFactory.namedNode(OWL + 'onProperty'), DataFactory.namedNode(TA + 'assignedTo'));
    store.addQuad(blank, DataFactory.namedNode(OWL + 'allValuesFrom'), DataFactory.namedNode(PM + 'Person'));
    return { store, task };
  };
  const subClassOfCount = (store: Store) =>
    store.getQuads(DataFactory.namedNode(TA + 'Task'), DataFactory.namedNode(RDFS + 'subClassOf'), null, null).length;

  it('removes an allValuesFrom restriction on the external class', () => {
    const { store } = build();
    removeExternalClassReferencesFromStore(store, PM + 'Person');
    expect(subClassOfCount(store)).toBe(0);
  });

  it('lists it among the quads removed, and adding those back restores it', () => {
    const { store } = build();
    const removed = getQuadsRemovedForExternalClass(store, PM + 'Person');
    expect(removed).toHaveLength(1);
    removeExternalClassReferencesFromStore(store, PM + 'Person');
    store.addQuads(removed);
    expect(subClassOfCount(store)).toBe(1);
  });
});
