import { describe, it, expect } from 'vitest';
import {
  getTransitiveChildIds,
  getTransitiveParentIds,
} from './classGraphTraversal';
import type { GraphEdge } from '../types';

const classIds = new Set(['A', 'B', 'C', 'D']);

describe('classGraphTraversal', () => {
  describe('getTransitiveChildIds', () => {
    it('returns only the node when it has no incoming subClassOf edges (no subclasses)', () => {
      const edges: GraphEdge[] = [{ from: 'A', to: 'B', type: 'subClassOf' }];
      expect(getTransitiveChildIds('A', edges, classIds)).toEqual(['A']);
    });

    it('returns node plus direct and transitive subClassOf children', () => {
      const edges: GraphEdge[] = [
        { from: 'B', to: 'A', type: 'subClassOf' },
        { from: 'C', to: 'B', type: 'subClassOf' },
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

    it('follows a non-subClassOf property edge forward (domain -> target) once its domain is a known child', () => {
      // Mirrors the real-world case: :Section rdfs:subClassOf :LayoutContentType ;
      // rdfs:subClassOf [ owl:onProperty :hasOrientation ; owl:onClass :OrientationValue ].
      const edges: GraphEdge[] = [
        { from: 'Section', to: 'LayoutContentType', type: 'subClassOf' },
        { from: 'Section', to: 'Orientation', type: 'hasOrientation' },
      ];
      const ids = new Set(['Section', 'LayoutContentType', 'Orientation']);
      const result = getTransitiveChildIds('LayoutContentType', edges, ids);
      expect(result.sort()).toEqual(['LayoutContentType', 'Orientation', 'Section']);
    });

    it('does not backward-crawl through a non-subClassOf property edge (regression for over-broad selection)', () => {
      // Mirrors the real-world bug: :Layout rdfs:subClassOf [ owl:onProperty :hasProperty ;
      // owl:onClass :LayoutContentType ] must NOT make Layout a "child" of LayoutContentType -
      // "Layout has a LayoutContentType" is not "Layout is a kind of LayoutContentType".
      const edges: GraphEdge[] = [
        { from: 'Layout', to: 'LayoutContentType', type: 'hasProperty' },
        { from: 'DrawingSheet', to: 'Layout', type: 'contains' },
      ];
      const ids = new Set(['Layout', 'LayoutContentType', 'DrawingSheet']);
      const result = getTransitiveChildIds('LayoutContentType', edges, ids);
      expect(result).toEqual(['LayoutContentType']);
    });

    it('ignores edges where either endpoint is not a class ID', () => {
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
    it('returns only the node when it has no outgoing subClassOf edges (no superclasses)', () => {
      const edges: GraphEdge[] = [{ from: 'B', to: 'A', type: 'subClassOf' }];
      expect(getTransitiveParentIds('A', edges, classIds)).toEqual(['A']);
    });

    it('returns node plus direct and transitive subClassOf parents', () => {
      const edges: GraphEdge[] = [
        { from: 'C', to: 'B', type: 'subClassOf' },
        { from: 'B', to: 'A', type: 'subClassOf' },
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

    it('follows a non-subClassOf property edge backward (target -> domain), the mirror of getTransitiveChildIds', () => {
      const edges: GraphEdge[] = [
        { from: 'Section', to: 'LayoutContentType', type: 'subClassOf' },
        { from: 'Section', to: 'Orientation', type: 'hasOrientation' },
      ];
      const ids = new Set(['Section', 'LayoutContentType', 'Orientation']);
      const result = getTransitiveParentIds('Orientation', edges, ids);
      expect(result.sort()).toEqual(['LayoutContentType', 'Orientation', 'Section']);
    });

    it('does not forward-crawl through a non-subClassOf property edge', () => {
      const edges: GraphEdge[] = [{ from: 'A', to: 'B', type: 'someProperty' }];
      const ids = new Set(['A', 'B']);
      const result = getTransitiveParentIds('A', edges, ids);
      expect(result).toEqual(['A']);
    });

    it('ignores edges where either endpoint is not a class ID', () => {
      const edges: GraphEdge[] = [
        { from: 'B', to: 'A', type: 'subClassOf' },
        { from: 'B', to: '__dataprop__A__foo', type: 'dataprop' },
      ];
      const ids = new Set(['A', 'B']);
      const result = getTransitiveParentIds('B', edges, ids);
      expect(result).toEqual(expect.arrayContaining(['A', 'B']));
      expect(result).not.toContain('__dataprop__A__foo');
    });
  });
});
