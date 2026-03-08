/**
 * Unit tests for removing external class references from the store.
 */
import { describe, it, expect } from 'vitest';
import { Store, DataFactory } from 'n3';
import {
  getQuadsRemovedForExternalClass,
  removeExternalClassReferencesFromStore,
  restoreQuadsToStore,
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

describe('restoreQuadsToStore and undo round-trip', () => {
  it('undo: getQuadsRemoved -> remove -> restore restores store state', () => {
    const store = new Store();
    const assignedTo = DataFactory.namedNode(TA + 'assignedTo');
    const task = DataFactory.namedNode(TA + 'Task');
    const person = DataFactory.namedNode(PM + 'Person');
    store.addQuad(assignedTo, DataFactory.namedNode(RDFS + 'domain'), task);
    store.addQuad(assignedTo, DataFactory.namedNode(RDFS + 'range'), person);

    const quadsToRestore = getQuadsRemovedForExternalClass(store, PM + 'Person');
    removeExternalClassReferencesFromStore(store, PM + 'Person');
    expect(store.getQuads(null, null, null, null).length).toBe(1);

    restoreQuadsToStore(store, quadsToRestore);
    const rangeQuads = store.getQuads(assignedTo, DataFactory.namedNode(RDFS + 'range'), null, null);
    expect(rangeQuads.length).toBe(1);
    expect((rangeQuads[0].object as { value: string }).value).toBe(PM + 'Person');
  });
});
