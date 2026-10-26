/**
 * The prefixes a Turtle file declares, for the query panel (#171). Unlike the helper the external references
 * use, this keeps the default prefix (`:`) and the SPARQL-style `PREFIX` form.
 */
import { describe, it, expect } from 'vitest';
import { declaredPrefixes } from '../../src/sparql/declaredPrefixes';

describe('declaredPrefixes', () => {
  it('reads @prefix declarations, including the default prefix', () => {
    const ttl = `@prefix : <http://example.org/o#>.
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix ex:<http://example.org/other/>.`;
    expect(declaredPrefixes(ttl)).toEqual({
      '': 'http://example.org/o#',
      owl: 'http://www.w3.org/2002/07/owl#',
      ex: 'http://example.org/other/',
    });
  });

  it('reads the SPARQL-style PREFIX form, in any case', () => {
    const ttl = `PREFIX : <http://example.org/o#>
prefix ex: <http://example.org/other/>`;
    expect(declaredPrefixes(ttl)).toEqual({ '': 'http://example.org/o#', ex: 'http://example.org/other/' });
  });

  it('lets a later declaration of the same prefix win', () => {
    expect(declaredPrefixes('@prefix a: <http://one/> .\n@prefix a: <http://two/> .')).toEqual({ a: 'http://two/' });
  });

  it('accepts prefixes with digits, dashes and dots, and ignores text that is not a declaration', () => {
    const ttl = `@prefix dc-terms.v2: <http://purl.org/dc/terms/> .
:A rdfs:comment "see @prefix fake: <http://not/a/declaration> ." .`;
    expect(declaredPrefixes(ttl)).toEqual({ 'dc-terms.v2': 'http://purl.org/dc/terms/' });
  });

  it('returns nothing for a file with no declarations', () => {
    expect(declaredPrefixes('<http://a> <http://b> <http://c> .')).toEqual({});
    expect(declaredPrefixes('')).toEqual({});
  });
});
