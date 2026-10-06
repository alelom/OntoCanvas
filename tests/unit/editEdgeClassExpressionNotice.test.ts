import { describe, it, expect } from 'vitest';
import { findClassExpressionGroupForEdge, noticeTargetText } from '../../src/ui/editEdgeClassExpressionNotice';
import type { ClassExpressionGroup } from '../../src/types';

const domainGroup: ClassExpressionGroup = {
  operator: 'union',
  members: ['Section', 'Detail'],
  propertyName: 'hasOrientation',
  propertyUri: 'http://example.org/o#hasOrientation',
  counterparts: ['OrientationValue'],
  position: 'domain',
  propertyKind: 'object',
};

const rangeGroup: ClassExpressionGroup = {
  operator: 'union',
  members: ['Wall', 'Floor'],
  propertyName: 'hasPart',
  propertyUri: 'http://example.org/o#hasPart',
  counterparts: ['Room'],
  position: 'range',
  propertyKind: 'object',
};

describe('findClassExpressionGroupForEdge', () => {
  it('matches a domain-union member on the edge FROM, by property local name', () => {
    expect(findClassExpressionGroupForEdge([domainGroup], 'Section', 'OrientationValue', 'hasOrientation')).toBe(domainGroup);
    expect(findClassExpressionGroupForEdge([domainGroup], 'Detail', 'OrientationValue', 'hasOrientation')).toBe(domainGroup);
  });

  it('matches a range-union member on the edge TO', () => {
    expect(findClassExpressionGroupForEdge([rangeGroup], 'Room', 'Wall', 'hasPart')).toBe(rangeGroup);
    expect(findClassExpressionGroupForEdge([rangeGroup], 'Room', 'Floor', 'hasPart')).toBe(rangeGroup);
  });

  it('matches by full property URI', () => {
    expect(findClassExpressionGroupForEdge([domainGroup], 'Section', 'OrientationValue', 'http://example.org/o#hasOrientation')).toBe(domainGroup);
  });

  it('matches when the edge type is a local name but the group only knows the URI', () => {
    const uriOnly = { ...domainGroup, propertyName: 'http://example.org/o#hasOrientation' };
    expect(findClassExpressionGroupForEdge([uriOnly], 'Section', 'OrientationValue', 'hasOrientation')).toBe(uriOnly);
  });

  it('does not match when neither edge end is a member', () => {
    expect(findClassExpressionGroupForEdge([domainGroup], 'DrawingSheet', 'OrientationValue', 'hasOrientation')).toBeNull();
  });

  it('does not match a different property', () => {
    expect(findClassExpressionGroupForEdge([domainGroup], 'Section', 'OrientationValue', 'contains')).toBeNull();
  });

  it('handles empty / undefined groups', () => {
    expect(findClassExpressionGroupForEdge([], 'Section', 'OrientationValue', 'hasOrientation')).toBeNull();
    expect(findClassExpressionGroupForEdge(undefined, 'Section', 'OrientationValue', 'hasOrientation')).toBeNull();
  });
});

describe('findClassExpressionGroupForEdge: other operators (#60, #61, #62)', () => {
  it('matches an intersection, complement or oneOf group the same way as a union', () => {
    const inter: ClassExpressionGroup = { ...domainGroup, operator: 'intersection' };
    const comp: ClassExpressionGroup = { ...rangeGroup, operator: 'complement', members: ['Wall'] };
    const enumeration: ClassExpressionGroup = { ...rangeGroup, operator: 'oneOf', members: ['Floor'], values: ['GroundFloor'] };
    expect(findClassExpressionGroupForEdge([inter], 'Section', 'OrientationValue', 'hasOrientation')).toBe(inter);
    expect(findClassExpressionGroupForEdge([comp], 'Room', 'Wall', 'hasPart')).toBe(comp);
    expect(findClassExpressionGroupForEdge([enumeration], 'Room', 'Floor', 'hasPart')).toBe(enumeration);
  });
});

describe('findClassExpressionGroupForEdge: data-property range expression (#62)', () => {
  it('matches a data-property stub on one of the counterparts (the domain classes)', () => {
    const paper: ClassExpressionGroup = {
      operator: 'oneOf', members: [], values: ['A0', 'A1'], counterparts: ['Sheet'],
      propertyName: 'paperSize', position: 'range', propertyKind: 'data',
    };
    expect(findClassExpressionGroupForEdge([paper], 'Sheet', 'Sheet', 'paperSize')).toBe(paper);
    expect(findClassExpressionGroupForEdge([paper], 'Drawing', 'Drawing', 'paperSize')).toBeNull();
  });
});

describe('noticeTargetText: what the Edit-edge notice says the expression is', () => {
  const base = { propertyName: 'p', position: 'range' as const, counterparts: ['C'] };
  it('describes a datatype enumeration as literal values, with no class edge', () => {
    const text = noticeTargetText({ ...base, operator: 'oneOf', members: [], values: ['A0'], propertyKind: 'data' });
    expect(text).toBe('an enumeration of these literal values');
  });
  it('says the edge goes to the individuals\' class only when there is one', () => {
    expect(noticeTargetText({ ...base, operator: 'oneOf', members: ['Orientation'], values: ['P'], propertyKind: 'object' }))
      .toBe('an enumeration of these individuals; the edge is drawn to their class');
    expect(noticeTargetText({ ...base, operator: 'oneOf', members: [], values: ['P'], propertyKind: 'object' }))
      .toBe('an enumeration of these individuals');
  });
  it('keeps the union / intersection / complement wording', () => {
    expect(noticeTargetText({ ...base, operator: 'union', members: ['A', 'B'], propertyKind: 'object' })).toBe('a union of these classes');
    expect(noticeTargetText({ ...base, operator: 'intersection', members: ['A', 'B'], propertyKind: 'object' })).toBe('an intersection of these classes');
    expect(noticeTargetText({ ...base, operator: 'complement', members: ['A'], propertyKind: 'object' }))
      .toBe('the complement of this class (anything that is not it)');
  });
});
