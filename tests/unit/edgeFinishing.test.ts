import { describe, it, expect } from 'vitest';
import { dedupeEdges, spaceEdges } from '../../src/graph/edgeFinishing';
import type { ObjectPropertyInfo } from '../../src/types';

const edge = (from: string, to: string, type: string) => ({ id: `${from}->${to}:${type}`, from, to });
const property = (name: string, uri: string) => ({ name, uri }) as ObjectPropertyInfo;

describe('dedupeEdges', () => {
  it('keeps edges that differ in a node or in the relationship', () => {
    const edges = [edge('A', 'B', 'p'), edge('A', 'C', 'p'), edge('A', 'B', 'q')];

    expect(dedupeEdges(edges, [])).toHaveLength(3);
  });

  it('drops a relationship drawn twice under the name and under the IRI of its property', () => {
    const edges = [edge('A', 'B', 'hasPart'), edge('A', 'B', 'http://example.org/o#hasPart')];

    const kept = dedupeEdges(edges, [property('hasPart', 'http://example.org/o#hasPart')]);

    expect(kept.map((e) => e.id)).toEqual(['A->B:hasPart']);
  });
});

describe('spaceEdges', () => {
  it('separates the self-loops from the regular edges', () => {
    const { regularEdges, selfLoops } = spaceEdges([edge('A', 'A', 'p'), edge('A', 'B', 'p')], 18);

    expect(selfLoops.map((e) => e.id)).toEqual(['A->A:p']);
    expect(regularEdges.map((e) => e.id)).toEqual(['A->B:p']);
  });

  it('gives one self-loop the default angle, and several concentric loops at different angles', () => {
    const one = spaceEdges([edge('A', 'A', 'p')], 18).selfLoops[0] as { selfReference: { size: number; angle: number } };
    const two = spaceEdges([edge('A', 'A', 'p'), edge('A', 'A', 'q')], 18).selfLoops as { selfReference: { size: number; angle: number } }[];

    expect(one.selfReference).toEqual({ size: 36, angle: Math.PI / 4 });
    expect(two[0].selfReference.size).toBeLessThan(two[1].selfReference.size);
    expect(two[0].selfReference.angle).not.toBe(two[1].selfReference.angle);
  });

  it('curves the edges between the same two nodes opposite ways, and leaves a lone edge straight', () => {
    const { regularEdges } = spaceEdges([edge('A', 'B', 'p'), edge('B', 'A', 'q'), edge('A', 'C', 'p')], 18) as { regularEdges: { smooth?: { type: string; roundness: number } }[] };

    expect(regularEdges[0].smooth?.type).toBe('curvedCW');
    expect(regularEdges[1].smooth?.type).toBe('curvedCCW');
    expect(regularEdges[2].smooth).toBeUndefined();
  });
});
