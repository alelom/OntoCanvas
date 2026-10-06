import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/parser';

const EXAMPLES = join(dirname(fileURLToPath(import.meta.url)), '../../examples/class-expressions');

/** The hand-testing examples (linked from the #59-#62 PR) must keep producing their marks. */
describe('examples/class-expressions', () => {
  const cases: Array<[string, Record<string, number>]> = [
    ['union.ttl', { union: 4 }],
    ['intersection.ttl', { intersection: 4 }],
    ['complement.ttl', { complement: 3 }],
    ['oneOf.ttl', { oneOf: 4 }],
    ['all-class-expressions.ttl', { union: 2, oneOf: 2, intersection: 2, complement: 1 }],
  ];
  for (const [file, expected] of cases) {
    it(`${file} surfaces its class expressions`, async () => {
      const r = await parseRdfToGraph(readFileSync(join(EXAMPLES, file), 'utf-8'), { path: file });
      const counts: Record<string, number> = {};
      for (const g of r.graphData.classExpressions ?? []) counts[g.operator] = (counts[g.operator] ?? 0) + 1;
      expect(counts).toEqual(expected);
    });
  }
});
