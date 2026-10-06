import { describe, it, expect } from 'vitest';
import { describeClassExpression, expressionExample } from '../../src/ui/classExpressionModal';
import type { ClassExpressionGroup } from '../../src/types';

const base = { propertyUri: undefined, counterparts: [], propertyKind: 'object' as const };

describe('describeClassExpression (hover tooltip)', () => {
  it('union: lists members joined by ∪', () => {
    const g: ClassExpressionGroup = { ...base, operator: 'union', members: ['Section', 'Detail'], propertyName: 'p', position: 'domain' };
    expect(describeClassExpression(g).split('\n')[0]).toBe('Domain union: Section ∪ Detail');
  });

  it('#60 intersection: lists members joined by ∩', () => {
    const g: ClassExpressionGroup = { ...base, operator: 'intersection', members: ['Drawing', 'Approved'], propertyName: 'p', position: 'domain' };
    expect(describeClassExpression(g).split('\n')[0]).toBe('Domain intersection: Drawing ∩ Approved');
  });

  it('#61 complement: prefixes the single operand with ¬', () => {
    const g: ClassExpressionGroup = { ...base, operator: 'complement', members: ['Draft'], propertyName: 'p', position: 'range' };
    expect(describeClassExpression(g).split('\n')[0]).toBe('Range complement: ¬Draft');
  });

  it('#62 oneOf: lists the enumerated values in braces', () => {
    const g: ClassExpressionGroup = { ...base, operator: 'oneOf', members: [], values: ['A0', 'A1'], propertyName: 'p', position: 'range', propertyKind: 'data', counterparts: ['Sheet'] };
    expect(describeClassExpression(g).split('\n')[0]).toBe('Range enumeration: {A0, A1}');
  });
});

describe('expressionExample (plain-language modal example)', () => {
  const g = (o: Partial<ClassExpressionGroup>): ClassExpressionGroup =>
    ({ ...base, operator: 'union', members: [], propertyName: 'p', position: 'domain', ...o }) as ClassExpressionGroup;

  it('union reads as an OR', () => {
    expect(expressionExample(g({ members: ['A', 'B'] }))).toBe('any individual that has a <b>p</b> property is either a A or a B.');
  });

  it('#60 intersection reads as an AND', () => {
    expect(expressionExample(g({ operator: 'intersection', members: ['A', 'B'] }))).toBe(
      'any individual that has a <b>p</b> property is both a A and a B.',
    );
    expect(expressionExample(g({ operator: 'intersection', members: ['A', 'B', 'C'], position: 'range' }))).toBe(
      'the value of <b>p</b> is a A, a B, and a C, all at once.',
    );
  });

  it('#61 complement reads as a NOT', () => {
    expect(expressionExample(g({ operator: 'complement', members: ['Draft'], position: 'range' }))).toBe(
      'the value of <b>p</b> is anything that is not a Draft.',
    );
  });

  it('#62 oneOf reads as a closed list, for individuals and literals', () => {
    expect(expressionExample(g({ operator: 'oneOf', values: ['Portrait', 'Landscape'], position: 'range' }))).toBe(
      'the value of <b>p</b> is exactly one of: Portrait, Landscape.',
    );
  });

  it('escapes HTML in names', () => {
    expect(expressionExample(g({ operator: 'oneOf', values: ['<x>'], position: 'range' }))).toContain('&lt;x&gt;');
  });
});
