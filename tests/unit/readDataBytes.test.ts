/**
 * Reading the bytes of a data file or a download as text (#223): gzip is told by its first bytes and decompressed in the
 * browser, the decompressed bytes are counted and the read stops at the limit, and the format is told from the name without .gz.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { gzipSync } from 'node:zlib';
import { DataTooLargeError, estimateDataBytes, GZIP_ESTIMATE_RATIO, isGzipName, nameWithoutGz, readAsText } from '../../src/sparql/readDataBytes';

const streamOf = (bytes: Uint8Array, chunk = 1000): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      for (let at = 0; at < bytes.length; at += chunk) controller.enqueue(bytes.slice(at, at + chunk));
      controller.close();
    },
  });
const utf8 = (text: string) => new TextEncoder().encode(text);
const turtle = '@prefix : <http://example.org/d#> .\n:a a :Thing ; :label "café" .\n'.repeat(200);

afterEach(() => vi.unstubAllGlobals());

describe('names', () => {
  it('tells a gzip name and the name of the data inside it, also for an address with a query', () => {
    expect(isGzipName('part-0001.nq.gz')).toBe(true);
    expect(isGzipName('data.TTL.GZ')).toBe(true);
    expect(isGzipName('data.ttl')).toBe(false);
    expect(nameWithoutGz('part-0001.nq.gz')).toBe('part-0001.nq');
    expect(nameWithoutGz('https://example.org/run/part-0001.nq.gz?raw=1')).toBe('https://example.org/run/part-0001.nq?raw=1');
    expect(nameWithoutGz('data.ttl')).toBe('data.ttl');
  });

  it('estimates the data of a compressed file from its size, and takes a plain file at its size', () => {
    expect(estimateDataBytes({ name: 'a.nq.gz', size: 1000 })).toBe(1000 * GZIP_ESTIMATE_RATIO);
    expect(estimateDataBytes({ name: 'a.nq', size: 1000 })).toBe(1000);
  });
});

describe('readAsText', () => {
  it('reads plain bytes as UTF-8 text, a character split across chunks included', async () => {
    const read = await readAsText(streamOf(utf8(turtle), 7), { limitBytes: 1e6 });

    expect(read).toEqual({ text: turtle, bytes: utf8(turtle).length, compressed: false });
  });

  it('decompresses gzip, told by its first bytes, and counts the decompressed bytes', async () => {
    const read = await readAsText(streamOf(gzipSync(utf8(turtle))), { limitBytes: 1e6 });

    expect(read).toEqual({ text: turtle, bytes: utf8(turtle).length, compressed: true });
  });

  it('stops when the decompressed data passes the limit, with how far it read', async () => {
    const big = gzipSync(utf8('x'.repeat(200_000)));

    const error = await readAsText(streamOf(big), { limitBytes: 50_000 }).catch((e) => e);

    expect(error).toBeInstanceOf(DataTooLargeError);
    expect(error.compressed).toBe(true);
    expect(error.limitBytes).toBe(50_000);
  });

  it('stops plain data at the limit too', async () => {
    await expect(readAsText(streamOf(utf8('x'.repeat(2000))), { limitBytes: 1000 })).rejects.toBeInstanceOf(DataTooLargeError);
  });

  it('says to decompress outside the browser when it cannot decompress gzip', async () => {
    vi.stubGlobal('DecompressionStream', undefined);

    await expect(readAsText(streamOf(gzipSync(utf8(turtle))), { limitBytes: 1e6 })).rejects.toThrow(/7-Zip.*gunzip/);
  });

  it('says when data that starts like gzip is not valid gzip', async () => {
    await expect(readAsText(streamOf(new Uint8Array([0x1f, 0x8b, 1, 2, 3, 4, 5])), { limitBytes: 1e6 })).rejects.toThrow(/not valid gzip/);
  });

  it('stops with Cancelled when the read is cancelled', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(readAsText(streamOf(utf8(turtle)), { limitBytes: 1e6, signal: controller.signal })).rejects.toThrow('Cancelled');
  });

  it('reads an empty stream as empty text', async () => {
    expect(await readAsText(streamOf(new Uint8Array()), { limitBytes: 10 })).toEqual({ text: '', bytes: 0, compressed: false });
  });
});
