/**
 * How SPARQL results are shown (#171): terms as prefixed names / quoted literals / _:labels, and the PREFIX lines
 * the editor starts with. Pure functions, no DOM.
 */
import { describe, it, expect } from 'vitest';
import { DataFactory } from 'n3';
import { formatTerm } from '../../src/sparql/formatTerm';
import { prefixHeader } from '../../src/sparql/prefixHeader';

const { namedNode, literal, blankNode, quad } = DataFactory;
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const prefixes = { '': 'http://example.org/o#', ex: 'http://example.org/other/', rdfs: 'http://www.w3.org/2000/01/rdf-schema#' };

describe('formatTerm', () => {
  it('shows an IRI under a declared prefix, including the default one', () => {
    expect(formatTerm(namedNode('http://example.org/o#Person'), prefixes)).toMatchObject({ text: ':Person', kind: 'iri', title: 'http://example.org/o#Person' });
    expect(formatTerm(namedNode('http://example.org/other/Thing'), prefixes).text).toBe('ex:Thing');
    expect(formatTerm(namedNode('http://www.w3.org/2000/01/rdf-schema#label'), prefixes).text).toBe('rdfs:label');
  });

  it('shows the whole IRI in angle brackets when no prefix fits or the rest is not a valid local name', () => {
    expect(formatTerm(namedNode('http://elsewhere.org/x'), prefixes).text).toBe('<http://elsewhere.org/x>');
    expect(formatTerm(namedNode('http://example.org/o#has space'), prefixes).text).toBe('<http://example.org/o#has space>');
    expect(formatTerm(namedNode('http://example.org/o#a/b'), prefixes).text).toBe('<http://example.org/o#a/b>');
  });

  it('prefers the longest matching namespace', () => {
    const p = { a: 'http://example.org/', b: 'http://example.org/deep/' };
    expect(formatTerm(namedNode('http://example.org/deep/X'), p).text).toBe('b:X');
  });

  it('shows a plain literal quoted, with escapes for quotes and newlines', () => {
    expect(formatTerm(literal('A label'), prefixes)).toMatchObject({ text: '"A label"', kind: 'literal' });
    expect(formatTerm(literal('say "hi"\nnow'), prefixes).text).toBe('"say \\"hi\\"\\nnow"');
  });

  it('shows the language tag or the datatype, but not xsd:string', () => {
    expect(formatTerm(literal('A label', 'en'), prefixes).text).toBe('"A label"@en');
    expect(formatTerm(literal('5', namedNode(`${XSD}integer`)), { ...prefixes, xsd: XSD }).text).toBe('"5"^^xsd:integer');
    expect(formatTerm(literal('5', namedNode(`${XSD}integer`)), {}).text).toBe(`"5"^^<${XSD}integer>`);
    expect(formatTerm(literal('x', namedNode(`${XSD}string`)), prefixes).text).toBe('"x"');
  });

  it('shows a blank node as _:label', () => {
    expect(formatTerm(blankNode('n3-4'), prefixes)).toMatchObject({ text: '_:n3-4', kind: 'blank' });
  });

  it('shows a quoted triple', () => {
    const t = quad(namedNode('http://example.org/o#A'), namedNode('http://example.org/other/p'), literal('x'));
    expect(formatTerm(t, prefixes)).toMatchObject({ text: '<< :A ex:p "x" >>', kind: 'quad' });
  });
});

describe('prefixHeader', () => {
  it('always starts with rdf, rdfs, owl and xsd, then the file\'s own prefixes', () => {
    const header = prefixHeader({ ex: 'http://example.org/other/', '': 'http://example.org/o#' });
    expect(header.split('\n')).toEqual([
      'PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>',
      'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>',
      'PREFIX owl: <http://www.w3.org/2002/07/owl#>',
      'PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>',
      'PREFIX : <http://example.org/o#>',
      'PREFIX ex: <http://example.org/other/>',
    ]);
  });

  it('lists a standard prefix once, with the file\'s IRI if the file redefines it', () => {
    const lines = prefixHeader({ owl: 'http://example.org/my-owl#' }).split('\n');
    expect(lines.filter((l) => l.startsWith('PREFIX owl:'))).toEqual(['PREFIX owl: <http://example.org/my-owl#>']);
  });

  it('leaves out a prefix or IRI that SPARQL could not parse', () => {
    const header = prefixHeader({ 'bad prefix': 'http://x/', ok: 'http://example.org/ok#', worse: 'http://x/ >' });
    expect(header).toContain('PREFIX ok: <http://example.org/ok#>');
    expect(header).not.toContain('bad prefix');
    expect(header).not.toContain('worse');
  });

  it('works without any declared prefixes', () => {
    expect(prefixHeader({}).split('\n')).toHaveLength(4);
  });
});
