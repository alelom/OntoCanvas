/**
 * Property list helpers (moved out of main.ts, #175): the defining ontology of a URI, the annotation properties that
 * style classes, and the dependency bundle of the annotation properties list.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Store, Parser } from 'n3';
import { session } from '../../src/state/appState';
import {
  annotationPriorityOrder,
  buildAnnotationPropsDeps,
  currentDataProperties,
  currentObjectProperties,
  getDefiningOntologyFromUri,
} from '../../src/workflows/propertyLists';
import type { ExternalOntologyReference } from '../../src/storage';

const ref = (url: string) => ({ url, usePrefix: '', prefix: 'x' }) as unknown as ExternalOntologyReference;

beforeEach(() => {
  session.ttlStore = null;
  session.importedDeclarations = null;
  session.annotationProperties = [];
  session.externalOntologyReferences = [];
});

describe('getDefiningOntologyFromUri', () => {
  const refs = [ref('http://example.org/geo#'), ref('http://example.org/other')];

  it('names the referenced ontology a URI starts with, with or without the trailing #', () => {
    expect(getDefiningOntologyFromUri('http://example.org/geo#Place', refs)).toBe('http://example.org/geo#');
    expect(getDefiningOntologyFromUri('http://example.org/other#Thing', refs)).toBe('http://example.org/other');
  });

  it('says "an external ontology" for a URI no reference covers, and for no URI', () => {
    expect(getDefiningOntologyFromUri('http://elsewhere.org/x', refs)).toBe('an external ontology');
    expect(getDefiningOntologyFromUri(null, refs)).toBe('an external ontology');
    expect(getDefiningOntologyFromUri(undefined, refs)).toBe('an external ontology');
  });
});

describe('annotationPriorityOrder', () => {
  it('is empty without annotation properties', () => {
    expect(annotationPriorityOrder()).toEqual([]);
  });
});

describe('current property lists', () => {
  const store = new Store(
    new Parser().parse(
      '@prefix : <http://example.org/o#> . @prefix owl: <http://www.w3.org/2002/07/owl#> . ' +
        ':knows a owl:ObjectProperty . :age a owl:DatatypeProperty .'
    )
  );

  it('lists the store\'s own object and data properties when nothing was imported', () => {
    expect(currentObjectProperties(store).map((p) => p.name.split('#').pop())).toEqual(['knows']);
    expect(currentDataProperties(store).map((p) => p.name.split('#').pop())).toEqual(['age']);
  });
});

describe('buildAnnotationPropsDeps', () => {
  const ap = { name: 'note', uri: 'http://example.org/o#note' } as never;

  it('gives no initial values without a store or a node, and records that in the values map', () => {
    const values: Record<string, string[]> = {};
    const deps = buildAnnotationPropsDeps(null, values);
    expect(deps.getInitialValues(ap)).toEqual([]);
    expect(values).toEqual({ note: [] });
  });

  it('keeps the values map up to date when textual values change', () => {
    const values: Record<string, string[]> = {};
    buildAnnotationPropsDeps('A', values).onTextualValuesChange('note', ['one', 'two']);
    expect(values.note).toEqual(['one', 'two']);
  });
});
