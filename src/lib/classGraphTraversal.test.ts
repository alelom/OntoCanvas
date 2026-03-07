import { describe, it, expect } from 'vitest';
import {
  getTransitiveChildIds,
  getTransitiveParentIds,
} from './classGraphTraversal';
import type { GraphEdge } from '../types';

const classIds = new Set(['A', 'B', 'C', 'D']);

describe('classGraphTraversal', () => {
  describe('getTransitiveChildIds', () => {
    it('returns only the node when it has no incoming edges (no subclasses)', () => {
      const edges: GraphEdge[] = [{ from: 'A', to: 'B', type: 'subClassOf' }];
      expect(getTransitiveChildIds('A', edges, classIds)).toEqual(['A']);
    });

    it('returns node plus direct and transitive children (subclasses)', () => {
      const edges: GraphEdge[] = [
        { from: 'B', to: 'A', type: 'subClassOf' },
        { from: 'C', to: 'B', type: 'contains' },
      ];
      const result = getTransitiveChildIds('A', edges, classIds);
      expect(result).toContain('A');
      expect(result).toContain('B');
      expect(result).toContain('C');
      expect(result).toHaveLength(3);
    });

    it('includes the clicked node in the result', () => {
      const edges: GraphEdge[] = [{ from: 'B', to: 'A', type: 'subClassOf' }];
      expect(getTransitiveChildIds('A', edges, classIds)).toEqual(
        expect.arrayContaining(['A', 'B'])
      );
    });

    it('ignores edges where "from" is not a class ID', () => {
      const edges: GraphEdge[] = [
        { from: 'B', to: 'A', type: 'subClassOf' },
        { from: '__dataprop__A__foo', to: 'A', type: 'dataprop' },
      ];
      const ids = new Set(['A', 'B']);
      const result = getTransitiveChildIds('A', edges, ids);
      expect(result).toEqual(expect.arrayContaining(['A', 'B']));
      expect(result).not.toContain('__dataprop__A__foo');
    });
  });

  describe('getTransitiveParentIds', () => {
    it('returns only the node when it has no outgoing edges (no superclasses)', () => {
      const edges: GraphEdge[] = [{ from: 'B', to: 'A', type: 'subClassOf' }];
      expect(getTransitiveParentIds('A', edges, classIds)).toEqual(['A']);
    });

    it('returns node plus direct and transitive parents (superclasses)', () => {
      const edges: GraphEdge[] = [
        { from: 'C', to: 'B', type: 'subClassOf' },
        { from: 'B', to: 'A', type: 'contains' },
      ];
      const result = getTransitiveParentIds('C', edges, classIds);
      expect(result).toContain('C');
      expect(result).toContain('B');
      expect(result).toContain('A');
      expect(result).toHaveLength(3);
    });

    it('includes the clicked node in the result', () => {
      const edges: GraphEdge[] = [{ from: 'B', to: 'A', type: 'subClassOf' }];
      expect(getTransitiveParentIds('B', edges, classIds)).toEqual(
        expect.arrayContaining(['A', 'B'])
      );
    });
  });
});
