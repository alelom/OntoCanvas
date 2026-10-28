/**
 * The prefixes of an RDF/XML or a JSON-LD file (#187), for the query panel's starting `PREFIX` lines. rdf-parse reports none for
 * these formats (it does for Turtle), so they are read from the file: the `xmlns` attributes of the root element, and the
 * namespace terms of the `@context`.
 */
import { describe, it, expect } from 'vitest';
import { formatOf, jsonLdPrefixes, otherFormatPrefixes, rdfXmlPrefixes } from '../../src/rdf/otherFormatPrefixes';
import { parseRdfToGraph } from '../../src/ontology/buildGraph';

describe('rdfXmlPrefixes: the xmlns declarations of the root element', () => {
  it('reads the prefixed and the default namespaces', () => {
    const xml = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://example.org/o#" xmlns:ex="http://example.org/other/">
  <rdf:Description rdf:about="http://example.org/o#a"/>
</rdf:RDF>`;

    expect(rdfXmlPrefixes(xml)).toEqual({
      rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      '': 'http://example.org/o#',
      ex: 'http://example.org/other/',
    });
  });

  it('reads single-quoted values and attributes spread over several lines', () => {
    const xml = `<rdf:RDF
    xmlns:ex='http://example.org/ex#'
    xmlns:owl="http://www.w3.org/2002/07/owl#">
</rdf:RDF>`;

    expect(rdfXmlPrefixes(xml)).toEqual({ ex: 'http://example.org/ex#', owl: 'http://www.w3.org/2002/07/owl#' });
  });

  it('skips comments, the XML declaration and a DOCTYPE before the root element', () => {
    const xml = `<?xml version="1.0"?>
<!-- <fake xmlns:no="http://not/this/"> -->
<!DOCTYPE rdf:RDF>
<rdf:RDF xmlns:ex="http://example.org/ex#"></rdf:RDF>`;

    expect(rdfXmlPrefixes(xml)).toEqual({ ex: 'http://example.org/ex#' });
  });

  it('expands the entities of the DOCTYPE, as the OWL API writes its files', () => {
    const xml = `<?xml version="1.0"?>
<!DOCTYPE rdf:RDF [
    <!ENTITY owl "http://www.w3.org/2002/07/owl#" >
    <!ENTITY xsd "http://www.w3.org/2001/XMLSchema#" >
    <!ENTITY onto "http://example.org/onto#" >
]>
<rdf:RDF xmlns="&onto;" xmlns:owl="&owl;" xmlns:xsd="&xsd;" xml:base="http://example.org/onto"></rdf:RDF>`;

    expect(rdfXmlPrefixes(xml)).toEqual({
      '': 'http://example.org/onto#',
      owl: 'http://www.w3.org/2002/07/owl#',
      xsd: 'http://www.w3.org/2001/XMLSchema#',
    });
  });

  it('reads only the root element: a namespace declared further down is not a prefix of the file', () => {
    const xml = `<rdf:RDF xmlns:ex="http://example.org/ex#">
  <rdf:Description xmlns:inner="http://example.org/inner#" rdf:about="http://example.org/a"/>
</rdf:RDF>`;

    expect(rdfXmlPrefixes(xml)).toEqual({ ex: 'http://example.org/ex#' });
  });

  it('does not take xml: or xmlns: as prefixes, and does not stop at a > inside a quoted value', () => {
    const xml = `<rdf:RDF xml:base="http://example.org/" xmlns:xml="http://www.w3.org/XML/1998/namespace" xmlns:q="http://example.org/a>b#"></rdf:RDF>`;

    expect(rdfXmlPrefixes(xml)).toEqual({ q: 'http://example.org/a>b#' });
  });

  it('gives nothing for a document with no namespaces, or one that is not XML', () => {
    expect(rdfXmlPrefixes('<rdf:RDF></rdf:RDF>')).toEqual({});
    expect(rdfXmlPrefixes('not xml at all')).toEqual({});
    expect(rdfXmlPrefixes('')).toEqual({});
  });
});

describe('jsonLdPrefixes: the namespace terms of the @context', () => {
  it('reads the terms that map to a namespace ending in # or /', () => {
    const doc = JSON.stringify({
      '@context': { ex: 'http://example.org/ex#', schema: 'http://schema.org/', name: 'http://schema.org/name' },
      '@id': 'ex:a',
    });

    expect(jsonLdPrefixes(doc)).toEqual({ ex: 'http://example.org/ex#', schema: 'http://schema.org/' });
  });

  it('reads an expanded term definition that marks itself as a prefix, or whose IRI is a namespace', () => {
    const doc = JSON.stringify({
      '@context': {
        a: { '@id': 'http://example.org/a#', '@prefix': true },
        b: { '@id': 'http://example.org/b/' },
        c: { '@id': 'http://example.org/c' },
        d: { '@id': 'http://example.org/d', '@prefix': true },
      },
    });

    expect(jsonLdPrefixes(doc)).toEqual({ a: 'http://example.org/a#', b: 'http://example.org/b/', d: 'http://example.org/d' });
  });

  it('reads an array of contexts, and lets a later one win', () => {
    const doc = JSON.stringify({ '@context': [{ ex: 'http://one/' }, 'http://remote.example.org/context.jsonld', { ex: 'http://two/', y: 'http://y/' }] });

    expect(jsonLdPrefixes(doc)).toEqual({ ex: 'http://two/', y: 'http://y/' });
  });

  it('takes @vocab as the default prefix', () => {
    expect(jsonLdPrefixes(JSON.stringify({ '@context': { '@vocab': 'http://example.org/vocab#' } }))).toEqual({ '': 'http://example.org/vocab#' });
  });

  it('ignores keywords, compact IRIs, relative values and nulls', () => {
    const doc = JSON.stringify({ '@context': { '@base': 'http://example.org/base/', x: 'ex:thing', y: 'relative/', z: null, '@language': 'en' } });

    expect(jsonLdPrefixes(doc)).toEqual({});
  });

  it('reads the context of the first node of a top-level array, and nothing from a remote or missing context', () => {
    expect(jsonLdPrefixes(JSON.stringify([{ '@context': { ex: 'http://example.org/ex#' }, '@id': 'ex:a' }]))).toEqual({ ex: 'http://example.org/ex#' });
    expect(jsonLdPrefixes(JSON.stringify({ '@context': 'http://remote.example.org/context.jsonld' }))).toEqual({});
    expect(jsonLdPrefixes(JSON.stringify({ '@id': 'http://example.org/a' }))).toEqual({});
  });

  it('gives nothing for text that is not JSON', () => {
    expect(jsonLdPrefixes('{ not json')).toEqual({});
    expect(jsonLdPrefixes('')).toEqual({});
  });
});

describe('formatOf and otherFormatPrefixes', () => {
  it('tells RDF/XML and JSON-LD by content type or by the end of the path, and nothing else', () => {
    expect(formatOf({ contentType: 'application/rdf+xml' })).toBe('rdfxml');
    expect(formatOf({ path: 'https://example.org/onto.owl' })).toBe('rdfxml');
    expect(formatOf({ path: 'onto.RDF' })).toBe('rdfxml');
    expect(formatOf({ contentType: 'application/ld+json' })).toBe('jsonld');
    expect(formatOf({ path: 'onto.jsonld' })).toBe('jsonld');
    expect(formatOf({ contentType: 'text/turtle' })).toBeNull();
    expect(formatOf({ path: 'onto.ttl' })).toBeNull();
    expect(formatOf({})).toBeNull();
  });

  it('reads nothing for Turtle, whose prefixes the parser reports', () => {
    expect(otherFormatPrefixes('@prefix ex: <http://example.org/> .', { contentType: 'text/turtle' })).toEqual({});
  });
});

describe('the prefixes of a parsed RDF/XML or JSON-LD file (#187)', () => {
  it('has the xmlns prefixes of an RDF/XML file', async () => {
    const rdfXml = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:ex="http://example.org/">
  <rdf:Description rdf:about="http://example.org/a"><rdf:type rdf:resource="http://example.org/C"/></rdf:Description>
</rdf:RDF>`;

    const result = await parseRdfToGraph(rdfXml, { contentType: 'application/rdf+xml' });

    expect(result.prefixes).toEqual({ rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', ex: 'http://example.org/' });
  });

  it('has the namespace terms of the @context of a JSON-LD file', async () => {
    const jsonLd = JSON.stringify({ '@context': { ex: 'http://example.org/', name: 'http://example.org/name' }, '@id': 'ex:a', name: 'A' });

    const result = await parseRdfToGraph(jsonLd, { contentType: 'application/ld+json' });

    expect(result.prefixes).toEqual({ ex: 'http://example.org/' });
  });

  it('knows the format of a file from its path when no content type is given', async () => {
    const rdfXml = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:ex="http://example.org/">
  <rdf:Description rdf:about="http://example.org/a"><rdf:type rdf:resource="http://example.org/C"/></rdf:Description>
</rdf:RDF>`;

    const result = await parseRdfToGraph(rdfXml, { path: 'https://example.org/files/onto.owl' });

    expect(result.prefixes?.ex).toBe('http://example.org/');
  });
});

describe('the formats the loader accepts (#195 review)', () => {
  it.each(['onto.rdf', 'onto.owl', 'onto.xml', 'onto.rdfxml', 'https://example.org/files/onto.RDFXML?download=1'])('reads %s as RDF/XML', (path) => {
    expect(formatOf({ path })).toBe('rdfxml');
  });

  it.each(['onto.jsonld', 'onto.json', 'https://example.org/data/onto.JSON#top'])('reads %s as JSON-LD', (path) => {
    expect(formatOf({ path })).toBe('jsonld');
  });

  it.each(['application/rdf+xml', 'application/xml', 'text/xml', 'application/rdf+xml; charset=utf-8'])('reads the content type %s as RDF/XML', (contentType) => {
    expect(formatOf({ contentType })).toBe('rdfxml');
  });

  it.each(['application/ld+json', 'application/json', 'application/json; charset=utf-8'])('reads the content type %s as JSON-LD', (contentType) => {
    expect(formatOf({ contentType })).toBe('jsonld');
  });

  it('does not take other XML media types, which rdf-parse reads with other parsers, for RDF/XML', () => {
    expect(formatOf({ contentType: 'application/xhtml+xml' })).toBeNull();
    expect(formatOf({ contentType: 'image/svg+xml' })).toBeNull();
  });
});

describe('rdfXmlPrefixes: entities and comments in the DOCTYPE (#195 review)', () => {
  const doc = (subset: string, rootAttributes: string) => `<?xml version="1.0"?>\n<!DOCTYPE rdf:RDF [\n${subset}\n]>\n<rdf:RDF ${rootAttributes}></rdf:RDF>`;

  it('expands an entity whose value uses another entity', () => {
    const xml = doc('<!ENTITY base "http://x/"> <!ENTITY onto "&base;onto#">', 'xmlns="&onto;" xmlns:ex="&base;ex#"');

    expect(rdfXmlPrefixes(xml)).toEqual({ '': 'http://x/onto#', ex: 'http://x/ex#' });
  });

  it('declares no prefix, rather than a wrong one, when an entity cannot be expanded', () => {
    const xml = doc('<!ENTITY owl "http://www.w3.org/2002/07/owl#">', 'xmlns:owl="&owl;" xmlns:q="&unknown;" xmlns:r="http://x/&unknown;/"');

    expect(rdfXmlPrefixes(xml)).toEqual({ owl: 'http://www.w3.org/2002/07/owl#' });
  });

  it('gives up on entities that refer to each other, instead of looping, and declares no prefix for them', () => {
    const xml = doc('<!ENTITY a "&b;x"> <!ENTITY b "&a;y">', 'xmlns:p="&a;" xmlns:ok="http://example.org/ok#"');

    expect(rdfXmlPrefixes(xml)).toEqual({ ok: 'http://example.org/ok#' });
  });

  it('keeps the five predefined entities working', () => {
    expect(rdfXmlPrefixes('<rdf:RDF xmlns:a="http://x/?a=1&amp;b=2#"></rdf:RDF>')).toEqual({ a: 'http://x/?a=1&b=2#' });
  });

  it("is not thrown off by an apostrophe or a quote in a comment inside the DOCTYPE's subset", () => {
    const xml = doc(`<!-- the owl's entity, a "quoted" word, and a > sign -->\n<!ENTITY owl "http://www.w3.org/2002/07/owl#">`, 'xmlns:owl="&owl;" xmlns:ex="http://example.org/ex#"');

    expect(rdfXmlPrefixes(xml)).toEqual({ owl: 'http://www.w3.org/2002/07/owl#', ex: 'http://example.org/ex#' });
  });
});

describe('jsonLdPrefixes: @prefix false and urn namespaces (#195 review)', () => {
  it('does not take a term that says it is not a prefix, whatever its IRI ends with', () => {
    const doc = JSON.stringify({ '@context': { a: { '@id': 'http://example.org/a#', '@prefix': false }, b: { '@id': 'http://example.org/b#' } } });

    expect(jsonLdPrefixes(doc)).toEqual({ b: 'http://example.org/b#' });
  });

  it('takes a urn namespace, which ends with a colon', () => {
    const doc = JSON.stringify({ '@context': { isbn: 'urn:isbn:', uuid: 'urn:uuid:', thing: 'urn:example:thing' } });

    expect(jsonLdPrefixes(doc)).toEqual({ isbn: 'urn:isbn:', uuid: 'urn:uuid:' });
  });
});
