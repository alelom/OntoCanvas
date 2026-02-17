import { describe, it, expect, beforeEach } from 'vitest';
import { Store, DataFactory } from 'n3';
import {
  ensureExampleImageAnnotationProperty,
  getExampleImageUrisForClass,
  setExampleImageUrisForClass,
} from './exampleImageStore';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const OWL = 'http://www.w3.org/2002/07/owl#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const BASE = 'http://example.org/ont#';

describe('exampleImageStore', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store();
    const graph = DataFactory.defaultGraph();
    store.addQuad(
      DataFactory.namedNode(BASE + 'MyClass'),
      DataFactory.namedNode(RDF + 'type'),
      DataFactory.namedNode(OWL + 'Class'),
      graph
    );
  });

  describe('ensureExampleImageAnnotationProperty', () => {
    it('adds annotation property with type, label, comment when store is empty', () => {
      ensureExampleImageAnnotationProperty(store, BASE);
      const propUri = BASE.endsWith('#') ? BASE + 'exampleImage' : BASE + '#exampleImage';
      const apNode = DataFactory.namedNode(propUri);
      const typeQuads = store.getQuads(apNode, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'AnnotationProperty'), null);
      expect(typeQuads.length).toBe(1);
      const labelQuads = store.getQuads(apNode, DataFactory.namedNode(RDFS + 'label'), null, null);
      expect(labelQuads.length).toBe(1);
      expect((labelQuads[0].object as { value: string }).value).toBe('example image');
      const commentQuads = store.getQuads(apNode, DataFactory.namedNode(RDFS + 'comment'), null, null);
      expect(commentQuads.length).toBe(1);
      expect((commentQuads[0].object as { value: string }).value).toContain('example image');
    });

    it('is idempotent: second call does not duplicate quads', () => {
      ensureExampleImageAnnotationProperty(store, BASE);
      ensureExampleImageAnnotationProperty(store, BASE);
      const propUri = BASE.endsWith('#') ? BASE + 'exampleImage' : BASE + '#exampleImage';
      const apNode = DataFactory.namedNode(propUri);
      const typeQuads = store.getQuads(apNode, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'AnnotationProperty'), null);
      expect(typeQuads.length).toBe(1);
    });
  });

  describe('getExampleImageUrisForClass', () => {
    it('returns empty array when class has no exampleImage triples', () => {
      const uris = getExampleImageUrisForClass(store, 'MyClass', BASE);
      expect(uris).toEqual([]);
    });

    it('returns one URI when class has one exampleImage triple', () => {
      ensureExampleImageAnnotationProperty(store, BASE);
      setExampleImageUrisForClass(store, 'MyClass', ['img/foo.png'], BASE);
      const uris = getExampleImageUrisForClass(store, 'MyClass', BASE);
      expect(uris).toEqual(['img/foo.png']);
    });

    it('returns multiple URIs (relative and absolute) in order', () => {
      ensureExampleImageAnnotationProperty(store, BASE);
      setExampleImageUrisForClass(store, 'MyClass', ['img/a.png', 'https://example.org/b.jpg', 'img/c.png'], BASE);
      const uris = getExampleImageUrisForClass(store, 'MyClass', BASE);
      expect(uris).toEqual(['img/a.png', 'https://example.org/b.jpg', 'img/c.png']);
    });

    it('returns empty for unknown class', () => {
      const uris = getExampleImageUrisForClass(store, 'NonExistent', BASE);
      expect(uris).toEqual([]);
    });
  });

  describe('setExampleImageUrisForClass', () => {
    it('removes all when given empty list', () => {
      ensureExampleImageAnnotationProperty(store, BASE);
      setExampleImageUrisForClass(store, 'MyClass', ['img/foo.png'], BASE);
      setExampleImageUrisForClass(store, 'MyClass', [], BASE);
      const uris = getExampleImageUrisForClass(store, 'MyClass', BASE);
      expect(uris).toEqual([]);
    });

    it('sets one URI then two URIs', () => {
      ensureExampleImageAnnotationProperty(store, BASE);
      setExampleImageUrisForClass(store, 'MyClass', ['img/one.png'], BASE);
      expect(getExampleImageUrisForClass(store, 'MyClass', BASE)).toEqual(['img/one.png']);
      setExampleImageUrisForClass(store, 'MyClass', ['img/one.png', 'img/two.png'], BASE);
      expect(getExampleImageUrisForClass(store, 'MyClass', BASE)).toEqual(['img/one.png', 'img/two.png']);
    });

    it('ensures property exists on first use', () => {
      setExampleImageUrisForClass(store, 'MyClass', ['img/first.png'], BASE);
      const uris = getExampleImageUrisForClass(store, 'MyClass', BASE);
      expect(uris).toEqual(['img/first.png']);
      const propUri = BASE.endsWith('#') ? BASE + 'exampleImage' : BASE + '#exampleImage';
      const typeQuads = store.getQuads(
        DataFactory.namedNode(propUri),
        DataFactory.namedNode(RDF + 'type'),
        DataFactory.namedNode(OWL + 'AnnotationProperty'),
        null
      );
      expect(typeQuads.length).toBe(1);
    });

    it('returns false for unknown class', () => {
      const result = setExampleImageUrisForClass(store, 'NonExistent', ['img/x.png'], BASE);
      expect(result).toBe(false);
    });
  });
});
