/**
 * Reading a result stream only as far as the cap (#180): a result of 600,000 rows must cost the rows shown, not
 * all of them, and a query must be stoppable.
 */
import { describe, it, expect } from 'vitest';
import { range, type AsyncIterator } from 'asynciterator';
import { readCapped, QueryStopped } from '../../src/sparql/readCapped';

/** A stream of 1..n that counts how many items were pulled from it. */
function counting(n: number) {
  const pulled = { count: 0 };
  const stream = range(1, n).map((x) => {
    pulled.count++;
    return x;
  });
  return { stream: stream as AsyncIterator<number>, pulled };
}

describe('readCapped', () => {
  it('pulls the limit plus one from a huge stream, not all of it', async () => {
    const { stream, pulled } = counting(1_000_000);

    const { items, truncated } = await readCapped(stream, 500);

    expect(items).toHaveLength(500);
    expect(items[0]).toBe(1);
    expect(truncated).toBe(true);
    expect(pulled.count).toBeLessThan(600); // 501 plus whatever the iterator buffered ahead
  });

  it('destroys the stream once it has read enough', async () => {
    const { stream } = counting(1_000_000);
    await readCapped(stream, 10);
    expect(stream.destroyed).toBe(true);
  });

  it('is not truncated when the stream has exactly the limit', async () => {
    const { stream } = counting(500);
    const { items, truncated } = await readCapped(stream, 500);
    expect(items).toHaveLength(500);
    expect(truncated).toBe(false);
  });

  it('returns everything of a short stream', async () => {
    const { stream } = counting(3);
    expect(await readCapped(stream, 500)).toEqual({ items: [1, 2, 3], truncated: false });
  });

  it('stops when told to: it rejects and destroys the stream', async () => {
    const { stream } = counting(1_000_000_000);
    const controller = new AbortController();
    const reading = readCapped(stream, Number.MAX_SAFE_INTEGER - 1, controller.signal);

    controller.abort();

    await expect(reading).rejects.toBeInstanceOf(QueryStopped);
    expect(stream.destroyed).toBe(true);
  });

  it('rejects at once when it was stopped before it began', async () => {
    const { stream } = counting(10);
    const controller = new AbortController();
    controller.abort();
    await expect(readCapped(stream, 5, controller.signal)).rejects.toBeInstanceOf(QueryStopped);
    expect(stream.destroyed).toBe(true);
  });
});
