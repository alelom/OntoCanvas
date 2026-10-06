import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/parser';
import { getEdgeDisplayLabel } from '../../src/ui/relationshipUtils';
import { isEditableRestriction } from '../../src/rdf/restrictions';
import type { GraphEdge } from '../../src/types';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');

/** Restriction kinds on edges: ∃ some, ∀ only, ∋ hasValue, ⟲ hasSelf, cardinality (#63). */
describe('restriction kinds (#63)', async () => {
  const r = await parseRdfToGraph(readFileSync(join(FIXTURES, 'restrictionKinds.ttl'), 'utf-8'), { path: 'restrictionKinds.ttl' });
  const edge = (from: string, to: string, type: string): GraphEdge | undefined =>
    r.graphData.edges.find((e) => e.from === from && e.to === to && e.type === type);
  const label = (e: GraphEdge | undefined) => getEdgeDisplayLabel(e!, r.objectProperties, []);

  it('∃ someValuesFrom keeps its implied [1..*] and gains the ∃ prefix; a matching ∀ merges into the same edge', () => {
    const e = edge('Room', 'Wall', 'hasPart');
    expect(e?.restrictionKinds).toEqual(['some', 'only']);
    expect(label(e)).toBe('∃∀ hasPart [1..*]');
  });

  it('∀ allValuesFrom draws an edge with the ∀ prefix and no implied cardinality', () => {
    const e = edge('Building', 'Floor', 'hasFloor');
    expect(e?.restrictionKinds).toEqual(['only']);
    expect(e?.minCardinality ?? null).toBeNull();
    expect(label(e)).toBe('∀ hasFloor');
  });

  it('∋ hasValue draws an edge to the individual\'s class, naming the individual', () => {
    const e = edge('Sheet', 'Status', 'hasStatus');
    expect(e?.restrictionKinds).toEqual(['value']);
    expect(e?.restrictionValue).toBe('Current');
    expect(label(e)).toBe('∋ hasStatus {Current}');
  });

  it('⟲ hasSelf draws a self-loop', () => {
    const e = edge('Person', 'Person', 'knows');
    expect(e?.restrictionKinds).toEqual(['self']);
    expect(label(e)).toBe('⟲ knows');
  });

  it('unqualified owl:cardinality is read, drawn to the property range', () => {
    const e = edge('Sheet', 'Revision', 'hasRevision');
    expect(e?.restrictionKinds).toEqual(['unqualified']);
    expect(label(e)).toBe('hasRevision [2..2]');
  });

  it('an unqualified cardinality with no range has nowhere to point, so draws nothing', () => {
    expect(r.graphData.edges.some((e) => e.type === 'hasNote')).toBe(false);
  });

  it('qualified cardinality (onClass) is unchanged: no glyph', () => {
    const e = edge('DrawingSet', 'Sheet', 'contains');
    expect(e?.restrictionKinds).toEqual(['qualified']);
    expect(label(e)).toBe('contains [1..*]');
  });

  it('only ∃ and qualified restrictions are editable (the editor would rewrite the others)', () => {
    expect(isEditableRestriction(edge('DrawingSet', 'Sheet', 'contains')!)).toBe(true);
    expect(isEditableRestriction({ from: 'A', to: 'B', type: 'p', isRestriction: true, restrictionKinds: ['some'] })).toBe(true);
    expect(isEditableRestriction(edge('Room', 'Wall', 'hasPart')!)).toBe(false);
    expect(isEditableRestriction(edge('Building', 'Floor', 'hasFloor')!)).toBe(false);
    expect(isEditableRestriction(edge('Sheet', 'Status', 'hasStatus')!)).toBe(false);
    expect(isEditableRestriction(edge('Person', 'Person', 'knows')!)).toBe(false);
    expect(isEditableRestriction(edge('Sheet', 'Revision', 'hasRevision')!)).toBe(false);
    // Plain domain/range edges and legacy restriction edges without kinds stay editable.
    expect(isEditableRestriction({ from: 'A', to: 'B', type: 'p' })).toBe(true);
    expect(isEditableRestriction({ from: 'A', to: 'B', type: 'p', isRestriction: true })).toBe(true);
  });
});
