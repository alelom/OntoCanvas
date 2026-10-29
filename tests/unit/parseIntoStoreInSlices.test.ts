/**
 * Reading a data file into a store in slices (#205): the parser is fed a slice of the text at a time, with a yield to the
 * event loop between slices, so a big file does not freeze the page; progress is reported, and the read can be cancelled.
 */
import { describe, it, expect, vi } from 'vitest';
import { Store } from 'n3';
import { parseIntoStoreInSlices } from '../../src/rdf/parseIntoStore';
import { parseRdfToQuads } from '../../src/rdf/parseRdfToQuads';

const header = '@prefix : <http://example.org/d#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n';
const turtle = (individuals: number) =>
  header + Array.from({ length: individuals }, (_, i) => `:i${i} a :Thing ; rdfs:label "Item ${i}" ; :next :i${(i + 1) % individuals} .`).join('\n');

describe('parseIntoStoreInSlices', () => {
  it('reads every triple, as reading the whole text at once does', async () => {
    const text = turtle(2000);

    const { store } = await parseIntoStoreInSlices(text, { path: 'data.ttl', sliceChars: 3000 });

    expect(store.size).toBe((await parseRdfToQuads(text, { path: 'data.ttl' })).length);
    expect(store.size).toBe(6000);
  });

  it('yields to the event loop between slices, and reports the triples read so far, ending on the total', async () => {
    const text = turtle(2000);
    const yielded = vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    const progress: number[] = [];

    await parseIntoStoreInSlices(text, { path: 'data.ttl', sliceChars: 10_000, yieldToEventLoop: yielded, onProgress: (n) => progress.push(n) });

    expect(yielded.mock.calls.length).toBeGreaterThanOrEqual(Math.floor(text.length / 10_000));
    expect(progress.length).toBeGreaterThan(2);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(progress[progress.length - 1]).toBe(6000);
  });

  it('does not ask the store for its size while it reads: that is recomputed after every added quad, and costs more as the store grows (500k triples took 20 s instead of 3 s)', async () => {
    const size = vi.spyOn(Store.prototype, 'size', 'get');
    const progress: number[] = [];

    try {
      await parseIntoStoreInSlices(turtle(2000), { path: 'data.ttl', sliceChars: 3000, onProgress: (n) => progress.push(n) });

      expect(progress.length).toBeGreaterThan(5);
      expect(size.mock.calls.length).toBeLessThanOrEqual(1);
    } finally {
      size.mockRestore();
    }
  });

  it('reads a format whose slices cut through a token (JSON-LD, in slices of 7 characters)', async () => {
    const doc = JSON.stringify({ '@context': { '@vocab': 'http://example.org/d#' }, '@graph': [{ '@id': 'http://example.org/d#a', '@type': 'Thing', name: 'Alpha' }, { '@id': 'http://example.org/d#b', '@type': 'Thing', name: 'Beta' }] });

    const { store } = await parseIntoStoreInSlices(doc, { path: 'data.jsonld', sliceChars: 7 });

    expect(store.size).toBe(4);
  });

  it('keeps the prefixes the file declares', async () => {
    const { prefixes } = await parseIntoStoreInSlices(turtle(3), { path: 'data.ttl' });

    expect(prefixes[':'] ?? prefixes['']).toBe('http://example.org/d#');
  });

  it('stops when cancelled, rejecting with "Cancelled", and keeps nothing', async () => {
    const controller = new AbortController();
    const text = turtle(5000);

    const read = parseIntoStoreInSlices(text, { path: 'data.ttl', sliceChars: 5000, signal: controller.signal, onProgress: () => controller.abort() });

    await expect(read).rejects.toThrow('Cancelled');
  });

  it('rejects a file that is not valid, with the parser\'s message', async () => {
    await expect(parseIntoStoreInSlices(header + ':a :b', { path: 'bad.ttl' })).rejects.toThrow(/Failed to parse RDF/);
  });
});
