import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/parser';
import type { ClassExpressionGroup } from '../../src/types';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');

/**
 * Class expressions beyond owl:unionOf in rdfs:domain / rdfs:range: intersection (#60),
 * complement (#61) and enumeration (#62). They are surfaced as ClassExpressionGroups and drawn with
 * the same overlay mechanism as unions (#59).
 */
describe('class expression groups: intersection / complement / oneOf (#60, #61, #62)', async () => {
  const ttl = readFileSync(join(FIXTURES, 'classExpressions.ttl'), 'utf-8');
  const r = await parseRdfToGraph(ttl, { path: 'classExpressions.ttl' });
  const groups = r.graphData.classExpressions ?? [];
  const byProp = (name: string): ClassExpressionGroup | undefined => groups.find((g) => g.propertyName === name);
  // Edge types are full URIs for properties outside the default base.
  const edgesOf = (name: string) => r.graphData.edges.filter((e) => e.type === name || e.type.endsWith(`#${name}`));

  it('#60 surfaces an owl:intersectionOf object-property domain and flattens it to one edge per operand', () => {
    const g = byProp('hasRevision');
    expect(g).toMatchObject({ operator: 'intersection', position: 'domain', propertyKind: 'object', counterparts: ['Revision'] });
    expect(g!.members.sort()).toEqual(['Approved', 'Drawing']);
    expect(edgesOf('hasRevision').map((e) => `${e.from}->${e.to}`).sort()).toEqual(['Approved->Revision', 'Drawing->Revision']);
  });

  it('#60 surfaces an owl:intersectionOf data-property domain, badging both operand stubs', () => {
    const g = byProp('approvalCode');
    expect(g).toMatchObject({ operator: 'intersection', position: 'domain', propertyKind: 'data' });
    expect(g!.members.sort()).toEqual(['Approved', 'Drawing']);
    const dp = r.dataProperties.find((d) => d.name === 'approvalCode');
    expect(dp?.domains.sort()).toEqual(['Approved', 'Drawing']);
  });

  it('#61 surfaces an owl:complementOf object-property range as a single-member group with one edge', () => {
    const g = byProp('supersedes');
    expect(g).toMatchObject({ operator: 'complement', position: 'range', propertyKind: 'object', counterparts: ['Sheet'], members: ['Draft'] });
    expect(edgesOf('supersedes').map((e) => `${e.from}->${e.to}`)).toEqual(['Sheet->Draft']);
  });

  it('#61 surfaces an owl:complementOf data-property domain on the complemented class stub', () => {
    const g = byProp('issueDate');
    expect(g).toMatchObject({ operator: 'complement', position: 'domain', propertyKind: 'data', members: ['Draft'] });
  });

  it('#62 surfaces an owl:oneOf of typed individuals, anchored on their class', () => {
    const g = byProp('hasOrientation');
    expect(g).toMatchObject({ operator: 'oneOf', position: 'range', propertyKind: 'object', counterparts: ['Sheet'], members: ['Orientation'] });
    expect(g!.values).toEqual(['Portrait', 'Landscape']);
    // The individuals are not added as nodes; the relationship is drawn to their class.
    expect(r.graphData.nodes.some((n) => n.id === 'Portrait')).toBe(false);
    expect(edgesOf('hasOrientation').map((e) => `${e.from}->${e.to}`)).toEqual(['Sheet->Orientation']);
  });

  it('#62 surfaces an owl:oneOf of untyped individuals with no anchor class (marker on the counterpart)', () => {
    const g = byProp('hasStatus');
    expect(g).toMatchObject({ operator: 'oneOf', position: 'range', propertyKind: 'object', counterparts: ['Drawing'], members: [] });
    expect(g!.values).toEqual(['Current', 'Superseded']);
    expect(edgesOf('hasStatus')).toHaveLength(0);
  });

  it('#62 surfaces a datatype owl:oneOf of literals on the domain class stub', () => {
    const g = byProp('paperSize');
    expect(g).toMatchObject({ operator: 'oneOf', position: 'range', propertyKind: 'data', members: [], counterparts: ['Sheet'] });
    expect(g!.values).toEqual(['A0', 'A1', 'A3']);
  });

  it('resolves counterparts through an expression on the other end (union domain + oneOf range)', async () => {
    const ttl = readFileSync(join(FIXTURES, '../../examples/class-expressions/all-class-expressions.ttl'), 'utf-8');
    const all = (await parseRdfToGraph(ttl, { path: 'all.ttl' })).graphData.classExpressions ?? [];
    const union = all.find((x) => x.propertyName === 'hasOrientation' && x.operator === 'union');
    const oneOf = all.find((x) => x.propertyName === 'hasOrientation' && x.operator === 'oneOf');
    expect(union?.counterparts).toEqual(['Orientation']);
    expect(oneOf?.counterparts).toEqual(['Section', 'Detail']);
  });

  it('keeps the existing union groups unchanged (no values noise)', async () => {
    const u = await parseRdfToGraph(readFileSync(join(FIXTURES, 'unionDomain.ttl'), 'utf-8'), { path: 'u.ttl' });
    const op = (u.graphData.classExpressions ?? []).find((g) => g.propertyName === 'hasOrientation');
    expect(op).toMatchObject({ operator: 'union', position: 'domain' });
    expect(op!.values).toBeUndefined();
  });
});
