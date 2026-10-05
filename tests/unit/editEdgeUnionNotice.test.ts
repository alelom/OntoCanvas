import { describe, it, expect } from 'vitest';
import { findUnionGroupForEdge } from '../../src/ui/editEdgeUnionNotice';
import type { ClassExpressionGroup } from '../../src/types';

const group: ClassExpressionGroup = {
  operator: 'union',
  members: ['Section', 'Detail'],
  propertyName: 'hasOrientation',
  propertyUri: 'http://example.org/o#hasOrientation',
  range: 'OrientationValue',
  position: 'domain',
  propertyKind: 'object',
};

describe('findUnionGroupForEdge', () => {
  it('matches a member by property local name', () => {
    expect(findUnionGroupForEdge([group], 'Section', 'hasOrientation')).toBe(group);
    expect(findUnionGroupForEdge([group], 'Detail', 'hasOrientation')).toBe(group);
  });

  it('matches by full property URI', () => {
    expect(findUnionGroupForEdge([group], 'Section', 'http://example.org/o#hasOrientation')).toBe(group);
  });

  it('matches when the edge type is a local name but the group only knows the URI', () => {
    const uriOnly = { ...group, propertyName: 'http://example.org/o#hasOrientation' };
    expect(findUnionGroupForEdge([uriOnly], 'Section', 'hasOrientation')).toBe(uriOnly);
  });

  it('does not match a non-member class', () => {
    expect(findUnionGroupForEdge([group], 'DrawingSheet', 'hasOrientation')).toBeNull();
  });

  it('does not match a different property', () => {
    expect(findUnionGroupForEdge([group], 'Section', 'contains')).toBeNull();
  });

  it('handles empty / undefined groups', () => {
    expect(findUnionGroupForEdge([], 'Section', 'hasOrientation')).toBeNull();
    expect(findUnionGroupForEdge(undefined, 'Section', 'hasOrientation')).toBeNull();
  });
});
