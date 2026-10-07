import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../parser';
import { edgeLock } from './edgeEditability';
import type { GraphEdge } from '../types';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures');

/** Which edges the editor may write back (#58, #63). */
describe('edgeLock', async () => {
  const r = await parseRdfToGraph(readFileSync(join(FIXTURES, 'unionDomain.ttl'), 'utf-8'), { path: 'unionDomain.ttl' });
  const groups = r.graphData.classExpressions;
  const edge = (from: string, to: string) => r.graphData.edges.find((e) => e.from === from && e.to === to)!;

  it('locks an edge drawn from a class expression: writing it back would rewrite the expression (#58)', () => {
    // hasOrientation: domain Section ∪ Detail. Deleting one edge removed the shared rdfs:range; editing one
    // added an rdfs:domain next to the union, turning OR into AND.
    expect(edge('Section', 'OrientationValue')).toBeDefined();
    expect(edgeLock(edge('Section', 'OrientationValue'), groups)).toBe('classExpression');
    expect(edgeLock(edge('Detail', 'OrientationValue'), groups)).toBe('classExpression');
  });

  it('locks a restriction kind the editor cannot write (#63)', () => {
    const only: GraphEdge = { from: 'A', to: 'B', type: 'p', isRestriction: true, restrictionKinds: ['only'] };
    expect(edgeLock(only, groups)).toBe('restriction');
  });

  it('leaves plain domain/range edges and ∃ restrictions editable', () => {
    expect(edgeLock({ from: 'A', to: 'B', type: 'p' }, groups)).toBeNull();
    expect(edgeLock({ from: 'A', to: 'B', type: 'p', restrictionKinds: ['some'] }, groups)).toBeNull();
    expect(edgeLock({ from: 'Section', to: 'OrientationValue', type: 'otherProperty' }, groups)).toBeNull();
  });
});
