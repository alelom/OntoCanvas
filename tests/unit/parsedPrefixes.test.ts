/**
 * The prefixes a file declares, for the query panel's starting `PREFIX` lines (#171, #180). They are the ones the parser
 * itself used (the default prefix `:` included, the SPARQL-style `PREFIX` too), so they always agree with the terms in the
 * store: a relative namespace is resolved against `@base` the same way, and text in a literal or a comment that looks like
 * a declaration is not one. There is no second reader of the source text to disagree with the parser.
 */
import { describe, it, expect } from 'vitest';
import { parseRdfToGraph } from '../../src/parser';

const prefixesOf = async (content: string, options: { contentType?: string; baseIRI?: string } = { contentType: 'text/turtle' }) =>
  (await parseRdfToGraph(content, options)).prefixes;

describe('prefixes of a parsed file', () => {
  it('reads @prefix declarations, including the default prefix', async () => {
    const ttl = `@prefix : <http://example.org/o#>.
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix ex:<http://example.org/other/>.`;
    expect(await prefixesOf(ttl)).toEqual({
      '': 'http://example.org/o#',
      owl: 'http://www.w3.org/2002/07/owl#',
      ex: 'http://example.org/other/',
    });
  });

  it('reads the SPARQL-style PREFIX form, in any case', async () => {
    const ttl = `PREFIX : <http://example.org/o#>
prefix ex: <http://example.org/other/>`;
    expect(await prefixesOf(ttl)).toEqual({ '': 'http://example.org/o#', ex: 'http://example.org/other/' });
  });

  it('lets a later declaration of the same prefix win', async () => {
    expect(await prefixesOf('@prefix a: <http://one/> .\n@prefix a: <http://two/> .')).toEqual({ a: 'http://two/' });
  });

  it('accepts prefixes with digits, dashes and dots, and ignores text that is not a declaration', async () => {
    const ttl = `@prefix dc-terms.v2: <http://purl.org/dc/terms/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://a> rdfs:comment "see @prefix fake: <http://not/a/declaration> ." .
# @prefix commented: <http://not/a/declaration/either> .`;
    expect(await prefixesOf(ttl)).toEqual({
      'dc-terms.v2': 'http://purl.org/dc/terms/',
      rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    });
  });

  it('returns nothing for a file with no declarations', async () => {
    expect(await prefixesOf('<http://a> <http://b> <http://c> .')).toEqual({});
  });

  it('resolves a relative namespace against @base, so the header matches the terms of the store (#180)', async () => {
    const ttl = `@base <http://example.org/onto> .
@prefix : <#> .
@prefix sub: <sub/> .
:Room a <http://www.w3.org/2002/07/owl#Class> .`;
    const result = await parseRdfToGraph(ttl, { contentType: 'text/turtle' });

    expect(result.prefixes).toEqual({ '': 'http://example.org/onto#', sub: 'http://example.org/sub/' });
    expect(result.store.getQuads('http://example.org/onto#Room', null, null, null)).toHaveLength(1);
  });

  it('resolves a relative namespace against the address the file was opened from', async () => {
    const ttl = '@prefix : <#> .\n:Room a <http://www.w3.org/2002/07/owl#Class> .';
    expect(await prefixesOf(ttl, { contentType: 'text/turtle', baseIRI: 'http://example.org/files/o.ttl' })).toEqual({ '': 'http://example.org/files/o.ttl#' });
  });

  // A known limitation (#187): rdf-parse 5.x reports no prefixes for RDF/XML. When it, or the code of #187, starts to report
  // the xmlns prefixes this fails, on purpose, so that the expectation is updated with it.
  it('has no prefixes yet for an RDF/XML file, whose xmlns declarations rdf-parse does not report (#187)', async () => {
    const rdfXml = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:ex="http://example.org/">
  <rdf:Description rdf:about="http://example.org/a"><rdf:type rdf:resource="http://example.org/C"/></rdf:Description>
</rdf:RDF>`;
    expect(await prefixesOf(rdfXml, { contentType: 'application/rdf+xml' })).toEqual({});
  });
});
