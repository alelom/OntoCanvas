import { describe, it, expect } from 'vitest';
import { parseRdfToGraph, getAnnotationProperties } from '../../src/parser';
import {
  isUrlLikeValue,
  getAnnotationValuesForClass,
  setAnnotationValuesForClass,
} from '../../src/lib/annotationValues';

const NS = 'http://example.org/o#';
const TTL = `@prefix : <${NS}> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:exampleImage rdf:type owl:AnnotationProperty .
:note rdf:type owl:AnnotationProperty .

:Thing rdf:type owl:Class ;
    rdfs:label "Thing" ;
    :exampleImage <https://example.com/a.png> ;
    :exampleImage <https://example.com/b.png> .
`;

describe('isUrlLikeValue', () => {
  it('treats absolute and relative URLs/paths as links', () => {
    expect(isUrlLikeValue('https://example.com/a.png')).toBe(true);
    expect(isUrlLikeValue('http://x/y')).toBe(true);
    expect(isUrlLikeValue('img/photo.png')).toBe(true);
    expect(isUrlLikeValue('file.svg')).toBe(true);
  });

  it('treats free text as not a link', () => {
    expect(isUrlLikeValue('some note')).toBe(false);
    expect(isUrlLikeValue('hello world')).toBe(false);
    expect(isUrlLikeValue('')).toBe(false);
    expect(isUrlLikeValue('PlainLabel')).toBe(false);
  });
});

describe('getAnnotationProperties - comment capture', () => {
  it('captures rdfs:comment (used as the value-input placeholder)', async () => {
    const ttl = `${TTL.replace(':note rdf:type owl:AnnotationProperty .', ':note rdf:type owl:AnnotationProperty ;\n    rdfs:comment "A free-text note." .')}`;
    const { store } = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const note = getAnnotationProperties(store).find((ap) => ap.name === 'note');
    expect(note?.comment).toBe('A free-text note.');
  });
});

describe('getAnnotationValuesForClass', () => {
  it('returns all values for a multi-valued property', async () => {
    const { store } = await parseRdfToGraph(TTL, { path: 'test.ttl' });
    const values = getAnnotationValuesForClass(store, 'Thing', NS + 'exampleImage');
    expect(values.length).toBe(2);
    expect(values.some((v) => v.includes('a.png'))).toBe(true);
    expect(values.some((v) => v.includes('b.png'))).toBe(true);
  });

  it('returns [] for a property the class does not carry', async () => {
    const { store } = await parseRdfToGraph(TTL, { path: 'test.ttl' });
    expect(getAnnotationValuesForClass(store, 'Thing', NS + 'note')).toEqual([]);
  });
});

describe('setAnnotationValuesForClass', () => {
  it('stores URL-like values as IRIs and free text as literals', async () => {
    const { store } = await parseRdfToGraph(TTL, { path: 'test.ttl' });
    const ok = setAnnotationValuesForClass(store, 'Thing', NS + 'note', ['a plain note', 'https://example.com/c.png']);
    expect(ok).toBe(true);

    const quads = store.getQuads(null, null, null, null).filter((q) => (q.predicate as { value: string }).value === NS + 'note');
    expect(quads.length).toBe(2);
    const literal = quads.find((q) => q.object.termType === 'Literal');
    const iri = quads.find((q) => q.object.termType === 'NamedNode');
    expect(literal?.object.value).toBe('a plain note');
    expect(iri?.object.value).toBe('https://example.com/c.png');
  });

  it('replaces existing values and skips blanks', async () => {
    const { store } = await parseRdfToGraph(TTL, { path: 'test.ttl' });
    setAnnotationValuesForClass(store, 'Thing', NS + 'exampleImage', ['https://example.com/only.png', '  ', '']);
    const values = getAnnotationValuesForClass(store, 'Thing', NS + 'exampleImage');
    expect(values).toEqual(['https://example.com/only.png']);
  });

  it('returns false when the class is absent', async () => {
    const { store } = await parseRdfToGraph(TTL, { path: 'test.ttl' });
    expect(setAnnotationValuesForClass(store, 'Missing', NS + 'note', ['x'])).toBe(false);
  });
});
