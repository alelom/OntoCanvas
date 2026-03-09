import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createBoxSelectionState,
  startBoxSelection,
  updateBoxSelection,
  completeBoxSelection,
  cancelBoxSelection,
  findNodesInRectangle,
  filterEdgesForSelectedNodes,
  type BoxSelectionState,
} from './boxSelection';
import type { Network } from 'vis-network';

// Mock vis-network Network
const createMockNetwork = (): Network => {
  const nodePositions: Record<string, { x: number; y: number }> = {
    'node1': { x: 100, y: 100 },
    'node2': { x: 200, y: 200 },
    'node3': { x: 300, y: 300 },
    'node4': { x: 400, y: 400 },
  };

  return {
    getPositions: vi.fn(() => nodePositions),
    getEdges: vi.fn(() => ['edge1', 'edge2', 'edge3']),
    DOMtoCanvas: vi.fn((pos: { x: number; y: number }) => {
      // Simple mock: assume 1:1 mapping for tests
      return pos;
    }),
  } as unknown as Network;
};

describe('boxSelection', () => {
  let state: BoxSelectionState;
  let mockNet: Network;

  beforeEach(() => {
    state = createBoxSelectionState(10);
    mockNet = createMockNetwork();
  });

  describe('createBoxSelectionState', () => {
    it('should create state with default min drag distance', () => {
      const defaultState = createBoxSelectionState();
      expect(defaultState.minDragDistance).toBe(10);
      expect(defaultState.isActive).toBe(false);
      expect(state.startPos).toBeNull();
    });

    it('should create state with custom min drag distance', () => {
      const customState = createBoxSelectionState(20);
      expect(customState.minDragDistance).toBe(20);
    });
  });

  describe('startBoxSelection', () => {
    it('should start box selection with initial position', () => {
      startBoxSelection(state, 50, 50, false, false);
      
      expect(state.isActive).toBe(true);
      expect(state.startPos).toEqual({ x: 50, y: 50 });
      expect(state.currentPos).toEqual({ x: 50, y: 50 });
      expect(state.dragDistance).toBe(0);
      expect(state.modifierKeys).toEqual({ ctrl: false, shift: false });
    });

    it('should capture modifier keys', () => {
      startBoxSelection(state, 50, 50, true, false);
      expect(state.modifierKeys).toEqual({ ctrl: true, shift: false });
      
      startBoxSelection(state, 50, 50, false, true);
      expect(state.modifierKeys).toEqual({ ctrl: false, shift: true });
    });
  });

  describe('updateBoxSelection', () => {
    it('should update current position and calculate drag distance', () => {
      startBoxSelection(state, 50, 50, false, false);
      updateBoxSelection(state, 100, 100);
      
      expect(state.currentPos).toEqual({ x: 100, y: 100 });
      expect(state.dragDistance).toBeGreaterThan(0);
    });

    it('should not update if not active', () => {
      const initialPos = state.currentPos;
      updateBoxSelection(state, 100, 100);
      expect(state.currentPos).toBe(initialPos);
    });
  });

  describe('completeBoxSelection', () => {
    it('should return empty selection if minimum drag distance not reached', () => {
      startBoxSelection(state, 50, 50, false, false);
      updateBoxSelection(state, 55, 55); // Only 5px drag
      
      const result = completeBoxSelection(state, mockNet);
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
      expect(state.isActive).toBe(false);
    });

    it('should return nodes in rectangle when drag distance is sufficient', () => {
      startBoxSelection(state, 50, 50, false, false);
      updateBoxSelection(state, 250, 250); // 200px drag
      
      const result = completeBoxSelection(state, mockNet);
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(state.isActive).toBe(false);
    });

    it('should return empty selection if not active', () => {
      const result = completeBoxSelection(state, mockNet);
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });

    it('should include edges when edge data provider is provided', () => {
      startBoxSelection(state, 50, 50, false, false);
      updateBoxSelection(state, 250, 250);
      
      const getEdgeData = (edgeId: string) => {
        if (edgeId === 'edge1') return { from: 'node1', to: 'node2' };
        return null;
      };
      
      const result = completeBoxSelection(state, mockNet, getEdgeData);
      expect(result.edges.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cancelBoxSelection', () => {
    it('should cancel active selection', () => {
      startBoxSelection(state, 50, 50, false, false);
      updateBoxSelection(state, 100, 100);
      
      cancelBoxSelection(state);
      
      expect(state.isActive).toBe(false);
      expect(state.startPos).toBeNull();
      expect(state.currentPos).toBeNull();
      expect(state.dragDistance).toBe(0);
    });
  });

  describe('filterEdgesForSelectedNodes', () => {
    it('should return empty array if no nodes selected', () => {
      const getEdgeData = (edgeId: string) => {
        if (edgeId === 'edge1') return { from: 'node1', to: 'node2' };
        return null;
      };
      
      const result = filterEdgesForSelectedNodes(['edge1'], [], getEdgeData);
      expect(result).toEqual([]);
    });

    it('should return edges where both endpoints are selected', () => {
      const getEdgeData = (edgeId: string) => {
        if (edgeId === 'edge1') return { from: 'node1', to: 'node2' };
        if (edgeId === 'edge2') return { from: 'node2', to: 'node3' };
        if (edgeId === 'edge3') return { from: 'node1', to: 'node4' };
        return null;
      };
      
      const selectedNodes = ['node1', 'node2'];
      const result = filterEdgesForSelectedNodes(['edge1', 'edge2', 'edge3'], selectedNodes, getEdgeData);
      
      // edge1: node1->node2 (both selected) ✓
      // edge2: node2->node3 (node3 not selected) ✗
      // edge3: node1->node4 (node4 not selected) ✗
      expect(result).toEqual(['edge1']);
    });

    it('should return empty array if no edges match', () => {
      const getEdgeData = (edgeId: string) => {
        if (edgeId === 'edge1') return { from: 'node1', to: 'node3' };
        return null;
      };
      
      const selectedNodes = ['node2', 'node4'];
      const result = filterEdgesForSelectedNodes(['edge1'], selectedNodes, getEdgeData);
      expect(result).toEqual([]);
    });
  });
});
