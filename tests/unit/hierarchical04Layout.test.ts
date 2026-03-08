/**
 * Unit tests for hierarchical04 layout: component clustering and two-pass horizontal layout.
 */
import { describe, it, expect } from 'vitest';
import {
  computeHierarchical04,
  computeHierarchical04WithDebug,
} from '../../src/layouts/hierarchical04';
import type { GraphEdge } from '../../src/types';

const spacing = 80;

describe('computeHierarchical04', () => {
  it('returns positions for all node IDs', () => {
    const nodeIds = new Set(['A', 'B', 'C']);
    const edges: GraphEdge[] = [
      { from: 'A', to: 'B', type: 'subClassOf' },
      { from: 'B', to: 'C', type: 'subClassOf' },
    ];
    const positions = computeHierarchical04(nodeIds, edges, spacing);
    expect(Object.keys(positions).sort()).toEqual(['A', 'B', 'C']);
    Object.values(positions).forEach((p) => {
      expect(typeof p.x).toBe('number');
      expect(typeof p.y).toBe('number');
    });
  });

  it('clusters two disconnected components in separate horizontal regions', () => {
    const nodeIds = new Set(['R1', 'C1', 'R2', 'C2']);
    const edges: GraphEdge[] = [
      { from: 'R1', to: 'C1', type: 'contains' },
      { from: 'R2', to: 'C2', type: 'contains' },
    ];
    const positions = computeHierarchical04(nodeIds, edges, spacing);
    const comp1X = [positions['R1'].x, positions['C1'].x];
    const comp2X = [positions['R2'].x, positions['C2'].x];
    const min1 = Math.min(...comp1X);
    const max1 = Math.max(...comp1X);
    const min2 = Math.min(...comp2X);
    const max2 = Math.max(...comp2X);
    expect(max1).toBeLessThan(min2);
  });

  it('places multiple roots in same component together (DAG)', () => {
    const nodeIds = new Set(['R1', 'R2', 'C']);
    const edges: GraphEdge[] = [
      { from: 'R1', to: 'C', type: 'contains' },
      { from: 'R2', to: 'C', type: 'contains' },
    ];
    const positions = computeHierarchical04(nodeIds, edges, spacing);
    expect(Object.keys(positions)).toHaveLength(3);
    expect(positions['C'].y).toBeGreaterThan(positions['R1'].y);
    expect(positions['C'].y).toBeGreaterThan(positions['R2'].y);
  });

  it('orders components by size (larger first)', () => {
    const nodeIds = new Set(['S1', 'S2', 'L1', 'L2', 'L3']);
    const edges: GraphEdge[] = [
      { from: 'S1', to: 'S2', type: 'contains' },
      { from: 'L1', to: 'L2', type: 'contains' },
      { from: 'L1', to: 'L3', type: 'contains' },
    ];
    const positions = computeHierarchical04(nodeIds, edges, spacing);
    const smallMinX = Math.min(positions['S1'].x, positions['S2'].x);
    const largeMaxX = Math.max(positions['L1'].x, positions['L2'].x, positions['L3'].x);
    expect(largeMaxX).toBeLessThan(smallMinX);
  });

  it('places non-main components in a column at fixed horizontal distance (no fibonacci spread)', () => {
    const nodeIds = new Set(['M1', 'M2', 'M3', 'M4', 'O1', 'O2', 'O3', 'O4', 'O5']);
    const edges: GraphEdge[] = [
      { from: 'M1', to: 'M2', type: 'subClassOf' },
      { from: 'M1', to: 'M3', type: 'subClassOf' },
      { from: 'M2', to: 'M4', type: 'subClassOf' },
    ];
    const positions = computeHierarchical04(nodeIds, edges, spacing);
    const mainNodes = ['M1', 'M2', 'M3', 'M4'];
    const orphanNodes = ['O1', 'O2', 'O3', 'O4', 'O5'];
    const mainXs = mainNodes.map((id) => positions[id].x);
    const orphanXs = orphanNodes.map((id) => positions[id].x);
    const mainMaxX = Math.max(...mainXs);
    const orphanMinX = Math.min(...orphanXs);
    const orphanMaxX = Math.max(...orphanXs);
    const orphanSpread = orphanMaxX - orphanMinX;
    expect(orphanMinX).toBeGreaterThanOrEqual(mainMaxX);
    expect(orphanSpread).toBeLessThan(spacing * 2);
  });

  it('debug export: componentBounds match positions and non-main components have narrow x-band', () => {
    const nodeIds = new Set(['M1', 'M2', 'M3', 'O1', 'O2', 'O3']);
    const edges: GraphEdge[] = [
      { from: 'M1', to: 'M2', type: 'subClassOf' },
      { from: 'M1', to: 'M3', type: 'subClassOf' },
    ];
    const { positions, componentBounds } = computeHierarchical04WithDebug(
      nodeIds,
      edges,
      spacing
    );
    expect(componentBounds.length).toBeGreaterThanOrEqual(2);
    const mainBounds = componentBounds[0];
    const nonMainBounds = componentBounds.slice(1);
    const mainMaxX = mainBounds.maxX;
    const nonMainMinXs = nonMainBounds.map((b) => b.minX);
    const nonMainMaxXs = nonMainBounds.map((b) => b.maxX);
    nonMainMinXs.forEach((minX) => expect(minX).toBeGreaterThanOrEqual(mainMaxX));
    const spread = Math.max(...nonMainMaxXs) - Math.min(...nonMainMinXs);
    expect(spread).toBeLessThan(spacing * 2);
  });
});
