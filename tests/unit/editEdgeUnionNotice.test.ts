import { describe, it, expect } from 'vitest';
import { findUnionGroupForEdge } from '../../src/ui/editEdgeUnionNotice';
import type { ClassExpressionGroup } from '../../src/types';

const domainGroup: ClassExpressionGroup = {
  operator: 'union',
  members: ['Section', 'Detail'],
  propertyName: 'hasOrientation',
  propertyUri: 'http://example.org/o#hasOrientation',
  counterpart: 'OrientationValue',
  position: 'domain',
  propertyKind: 'object',
};

const rangeGroup: ClassExpressionGroup = {
  operator: 'union',
  members: ['Wall', 'Floor'],
  propertyName: 'hasPart',
  propertyUri: 'http://example.org/o#hasPart',
  counterpart: 'Room',
  position: 'range',
  propertyKind: 'object',
};

describe('findUnionGroupForEdge', () => {
  it('matches a domain-union member on the edge FROM, by property local name', () => {
    expect(findUnionGroupForEdge([domainGroup], 'Section', 'OrientationValue', 'hasOrientation')).toBe(domainGroup);
    expect(findUnionGroupForEdge([domainGroup], 'Detail', 'OrientationValue', 'hasOrientation')).toBe(domainGroup);
  });

  it('matches a range-union member on the edge TO', () => {
    expect(findUnionGroupForEdge([rangeGroup], 'Room', 'Wall', 'hasPart')).toBe(rangeGroup);
    expect(findUnionGroupForEdge([rangeGroup], 'Room', 'Floor', 'hasPart')).toBe(rangeGroup);
  });

  it('matches by full property URI', () => {
    expect(findUnionGroupForEdge([domainGroup], 'Section', 'OrientationValue', 'http://example.org/o#hasOrientation')).toBe(domainGroup);
  });

  it('matches when the edge type is a local name but the group only knows the URI', () => {
    const uriOnly = { ...domainGroup, propertyName: 'http://example.org/o#hasOrientation' };
    expect(findUnionGroupForEdge([uriOnly], 'Section', 'OrientationValue', 'hasOrientation')).toBe(uriOnly);
  });

  it('does not match when neither edge end is a member', () => {
    expect(findUnionGroupForEdge([domainGroup], 'DrawingSheet', 'OrientationValue', 'hasOrientation')).toBeNull();
  });

  it('does not match a different property', () => {
    expect(findUnionGroupForEdge([domainGroup], 'Section', 'OrientationValue', 'contains')).toBeNull();
  });

  it('handles empty / undefined groups', () => {
    expect(findUnionGroupForEdge([], 'Section', 'OrientationValue', 'hasOrientation')).toBeNull();
    expect(findUnionGroupForEdge(undefined, 'Section', 'OrientationValue', 'hasOrientation')).toBeNull();
  });
});
