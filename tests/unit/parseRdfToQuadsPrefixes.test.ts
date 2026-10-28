/**
 * Reading the prefixes of an RDF/XML or JSON-LD file costs a second pass over the text, so it is done only for the callers that
 * use the prefixes (#195 review): parseRdfToQuads, which the external ontology search and the import loading use, and which
 * throws them away, must not pay for it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/rdf/otherFormatPrefixes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/rdf/otherFormatPrefixes')>();
  return { ...actual, otherFormatPrefixes: vi.fn(actual.otherFormatPrefixes) };
});

import { otherFormatPrefixes } from '../../src/rdf/otherFormatPrefixes';
import { parseRdfToQuads, parseRdfToQuadsWithPrefixes } from '../../src/rdf/parseRdfToQuads';

const JSON_LD = JSON.stringify({ '@context': { ex: 'http://example.org/' }, '@id': 'ex:a', 'http://example.org/p': 'x' });
const options = { contentType: 'application/ld+json' };

beforeEach(() => {
  vi.mocked(otherFormatPrefixes).mockClear();
});

describe('parseRdfToQuads', () => {
  it('returns the quads without reading the prefixes', async () => {
    const quads = await parseRdfToQuads(JSON_LD, options);

    expect(quads).toHaveLength(1);
    expect(otherFormatPrefixes).not.toHaveBeenCalled();
  });
});

describe('parseRdfToQuadsWithPrefixes', () => {
  it('reads them, once', async () => {
    const result = await parseRdfToQuadsWithPrefixes(JSON_LD, options);

    expect(result.prefixes).toEqual({ ex: 'http://example.org/' });
    expect(otherFormatPrefixes).toHaveBeenCalledTimes(1);
  });
});
