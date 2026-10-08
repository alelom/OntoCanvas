import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/parser';
import { edgeLock } from '../../src/lib/edgeEditability';

const EXAMPLES = join(dirname(fileURLToPath(import.meta.url)), '../../examples/class-expressions');

/** The hand-testing examples (linked from the #59-#62 PR) must keep producing their marks. */
describe('examples/class-expressions', () => {
  const cases: Array<[string, Record<string, number>]> = [
    ['union.ttl', { union: 5 }],
    ['intersection.ttl', { intersection: 4 }],
    ['complement.ttl', { complement: 4 }],
    ['oneOf.ttl', { oneOf: 4 }],
    ['all-class-expressions.ttl', { union: 2, oneOf: 2, intersection: 2, complement: 1 }],
    ['self-loop-restriction.ttl', { union: 1, complement: 1 }],
    ['read-only-edges.ttl', { union: 2 }], // hasValue's union has one drawn member, so no mark
  ];
  for (const [file, expected] of cases) {
    it(`${file} surfaces its class expressions`, async () => {
      const r = await parseRdfToGraph(readFileSync(join(EXAMPLES, file), 'utf-8'), { path: file });
      const counts: Record<string, number> = {};
      for (const g of r.graphData.classExpressions ?? []) counts[g.operator] = (counts[g.operator] ?? 0) + 1;
      expect(counts).toEqual(expected);
    });
  }

  it('self-loop-restriction.ttl draws the restriction loops the marks must avoid (#86)', async () => {
    const file = 'self-loop-restriction.ttl';
    const r = await parseRdfToGraph(readFileSync(join(EXAMPLES, file), 'utf-8'), { path: file });
    const loops = r.graphData.edges.filter((e) => e.from === e.to).map((e) => `${e.from}:${e.type}`);
    expect(loops.sort()).toEqual(['Person:knows', 'Person:mentors']);
  });

  it('read-only-edges.ttl locks every edge drawn from an expression, marked or not (#58)', async () => {
    const file = 'read-only-edges.ttl';
    const r = await parseRdfToGraph(readFileSync(join(EXAMPLES, file), 'utf-8'), { path: file });
    const lockOf = (from: string, to: string, type: string) =>
      edgeLock(r.graphData.edges.find((e) => e.from === from && e.to === to && e.type === type)!);
    expect(lockOf('Section', 'Orientation', 'hasOrientation')).toBe('classExpression');
    expect(lockOf('Detail', 'Orientation', 'hasOrientation')).toBe('classExpression');
    expect(lockOf('Sheet', 'Value', 'hasValue')).toBe('classExpression');
    expect(lockOf('Person', 'Group', 'knows')).toBe('classExpression');
  });
});
