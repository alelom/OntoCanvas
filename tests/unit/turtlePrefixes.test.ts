/**
 * Unit tests for reading @prefix declarations out of Turtle source text.
 *
 * Regression guard for https://github.com/alelom/OntoCanvas/issues/32: only the first declaration
 * in a block of them was read, so every subject written with a later prefix looked like a subject
 * the document did not contain — and was appended again on save.
 */
import { describe, it, expect } from 'vitest';
import { parseTurtlePrefixes, resolveTurtlePrefixedName } from '../../src/rdf/turtlePrefixes';

const HEADER = `@prefix : <https://w3id.org/adiro/aec_provenance#> .
@base <https://w3id.org/adiro/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
`;

describe('parseTurtlePrefixes', () => {
  it('reads every declaration, not just the first', () => {
    const prefixes = parseTurtlePrefixes(HEADER);
    expect([...prefixes.keys()].sort()).toEqual(['', 'dcterms', 'owl', 'prov', 'rdf', 'rdfs']);
    expect(prefixes.get('prov')).toBe('http://www.w3.org/ns/prov#');
    expect(prefixes.get('')).toBe('https://w3id.org/adiro/aec_provenance#');
  });

  it('ignores @base, which is not a prefix', () => {
    expect(parseTurtlePrefixes(HEADER).has('base')).toBe(false);
  });

  it('accepts the SPARQL-style spelling', () => {
    const prefixes = parseTurtlePrefixes('PREFIX ex: <http://example.org/>\nprefix two: <http://example.org/2#>\n');
    expect(prefixes.get('ex')).toBe('http://example.org/');
    expect(prefixes.get('two')).toBe('http://example.org/2#');
  });

  it('accepts prefixes with dashes, dots and underscores', () => {
    const prefixes = parseTurtlePrefixes('@prefix dc-terms: <http://a/> .\n@prefix a.b: <http://b/> .\n@prefix _x: <http://c/> .');
    expect(prefixes.get('dc-terms')).toBe('http://a/');
    expect(prefixes.get('a.b')).toBe('http://b/');
    expect(prefixes.get('_x')).toBe('http://c/');
  });

  it('lets a later declaration of the same prefix win, as a parser does', () => {
    const prefixes = parseTurtlePrefixes('@prefix p: <http://first/> .\n@prefix p: <http://second/> .');
    expect(prefixes.get('p')).toBe('http://second/');
  });

  it('adds to a map it is given, so several header blocks accumulate', () => {
    const shared = new Map<string, string>();
    parseTurtlePrefixes('@prefix a: <http://a/> .', shared);
    parseTurtlePrefixes('@prefix b: <http://b/> .', shared);
    expect([...shared.keys()].sort()).toEqual(['a', 'b']);
  });

  it('returns nothing for text with no declarations', () => {
    expect(parseTurtlePrefixes('').size).toBe(0);
    expect(parseTurtlePrefixes(':Foo a owl:Class .').size).toBe(0);
  });
});

describe('resolveTurtlePrefixedName', () => {
  const prefixes = parseTurtlePrefixes(HEADER);

  it('resolves a named prefix', () => {
    expect(resolveTurtlePrefixedName('prov:Agent', prefixes)).toBe('http://www.w3.org/ns/prov#Agent');
  });

  it('resolves the empty prefix', () => {
    expect(resolveTurtlePrefixedName(':FieldAssertion', prefixes)).toBe(
      'https://w3id.org/adiro/aec_provenance#FieldAssertion'
    );
  });

  it('passes an absolute URI straight through', () => {
    expect(resolveTurtlePrefixedName('<http://example.org/x>', prefixes)).toBe('http://example.org/x');
  });

  it('returns null rather than guessing at an unknown prefix', () => {
    expect(resolveTurtlePrefixedName('nope:Thing', prefixes)).toBeNull();
    expect(resolveTurtlePrefixedName('NotPrefixed', prefixes)).toBeNull();
  });
});
