import { describe, it, expect, beforeEach } from 'vitest';
import {
  copyRelationshipsTargetingNode,
  pasteRelationshipsToNode,
  hasCopiedRelationships,
  getCopiedRelationships,
  clearClipboard,
  type CopiedRelationship,
} from './relationshipClipboard';
import { Store, DataFactory } from 'n3';
import { addEdgeToStore } from '../parser';
import type { GraphData, GraphEdge } from '../types';

describe('relationshipClipboard', () => {
  let store: Store;
  let rawData: GraphData;

  beforeEach(() => {
    store = new Store();
    rawData = {
      nodes: [
        { id: 'NodeA', label: 'Node A', labellableRoot: false },
        { id: 'NodeB', label: 'Node B', labellableRoot: false },
        { id: 'NodeC', label: 'Node C', labellableRoot: false },
      ],
      edges: [],
    };
    clearClipboard();
  });

  describe('copyRelationshipsTargetingNode', () => {
    it('should return empty array when no relationships target the node', () => {
      const result = copyRelationshipsTargetingNode('NodeA', rawData.edges);
      expect(result).toEqual([]);
      expect(hasCopiedRelationships()).toBe(false);
    });

    it('should copy relationships targeting the specified node', () => {
      rawData.edges = [
        { from: 'NodeB', to: 'NodeA', type: 'contains' },
        { from: 'NodeC', to: 'NodeA', type: 'partOf' },
        { from: 'NodeA', to: 'NodeB', type: 'contains' }, // This should NOT be copied
      ];

      const result = copyRelationshipsTargetingNode('NodeA', rawData.edges);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ from: 'NodeB', type: 'contains' });
      expect(result[1]).toEqual({ from: 'NodeC', type: 'partOf' });
      expect(hasCopiedRelationships()).toBe(true);
    });

    it('should copy relationships with cardinality', () => {
      rawData.edges = [
        {
          from: 'NodeB',
          to: 'NodeA',
          type: 'contains',
          minCardinality: 1,
          maxCardinality: 3,
        },
        {
          from: 'NodeC',
          to: 'NodeA',
          type: 'partOf',
          minCardinality: 0,
          maxCardinality: null,
        },
      ];

      const result = copyRelationshipsTargetingNode('NodeA', rawData.edges);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        from: 'NodeB',
        type: 'contains',
        minCardinality: 1,
        maxCardinality: 3,
      });
      expect(result[1]).toEqual({
        from: 'NodeC',
        type: 'partOf',
        minCardinality: 0,
        maxCardinality: null,
      });
    });

    it('should copy relationships with onClass property', () => {
      rawData.edges = [
        {
          from: 'NodeB',
          to: 'NodeA',
          type: 'contains',
          onClass: 'NodeC',
        },
      ];

      const result = copyRelationshipsTargetingNode('NodeA', rawData.edges);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        from: 'NodeB',
        type: 'contains',
        onClass: 'NodeC',
      });
    });
  });

  describe('hasCopiedRelationships', () => {
    it('should return false when clipboard is empty', () => {
      expect(hasCopiedRelationships()).toBe(false);
    });

    it('should return true after copying relationships', () => {
      rawData.edges = [{ from: 'NodeB', to: 'NodeA', type: 'contains' }];
      copyRelationshipsTargetingNode('NodeA', rawData.edges);
      expect(hasCopiedRelationships()).toBe(true);
    });
  });

  describe('getCopiedRelationships', () => {
    it('should return empty array when clipboard is empty', () => {
      expect(getCopiedRelationships()).toEqual([]);
    });

    it('should return copied relationships', () => {
      rawData.edges = [
        { from: 'NodeB', to: 'NodeA', type: 'contains' },
        { from: 'NodeC', to: 'NodeA', type: 'partOf' },
      ];
      copyRelationshipsTargetingNode('NodeA', rawData.edges);
      
      const copied = getCopiedRelationships();
      expect(copied).toHaveLength(2);
      expect(copied[0].from).toBe('NodeB');
      expect(copied[1].from).toBe('NodeC');
    });

    it('should return a copy, not the original array', () => {
      rawData.edges = [{ from: 'NodeB', to: 'NodeA', type: 'contains' }];
      copyRelationshipsTargetingNode('NodeA', rawData.edges);
      
      const copied = getCopiedRelationships();
      copied.push({ from: 'NodeD', type: 'test' } as CopiedRelationship);
      
      // Original clipboard should not be modified
      expect(getCopiedRelationships()).toHaveLength(1);
    });
  });

  describe('clearClipboard', () => {
    it('should clear the clipboard', () => {
      rawData.edges = [{ from: 'NodeB', to: 'NodeA', type: 'contains' }];
      copyRelationshipsTargetingNode('NodeA', rawData.edges);
      expect(hasCopiedRelationships()).toBe(true);
      
      clearClipboard();
      expect(hasCopiedRelationships()).toBe(false);
      expect(getCopiedRelationships()).toEqual([]);
    });
  });

  describe('pasteRelationshipsToNode', () => {
    beforeEach(() => {
      // Set up a basic store with nodes
      const BASE_IRI = 'http://example.org/aec-drawing-ontology#';
      const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
      const OWL = 'http://www.w3.org/2002/07/owl#';
      const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';

      // Add classes to store
      const graph = DataFactory.defaultGraph();
      store.addQuad(
        DataFactory.namedNode(BASE_IRI + 'NodeA'),
        DataFactory.namedNode(RDF + 'type'),
        DataFactory.namedNode(OWL + 'Class'),
        graph
      );
      store.addQuad(
        DataFactory.namedNode(BASE_IRI + 'NodeB'),
        DataFactory.namedNode(RDF + 'type'),
        DataFactory.namedNode(OWL + 'Class'),
        graph
      );
      store.addQuad(
        DataFactory.namedNode(BASE_IRI + 'NodeC'),
        DataFactory.namedNode(RDF + 'type'),
        DataFactory.namedNode(OWL + 'Class'),
        graph
      );

      // Add object properties
      store.addQuad(
        DataFactory.namedNode(BASE_IRI + 'contains'),
        DataFactory.namedNode(RDF + 'type'),
        DataFactory.namedNode(OWL + 'ObjectProperty'),
        graph
      );
      store.addQuad(
        DataFactory.namedNode(BASE_IRI + 'partOf'),
        DataFactory.namedNode(RDF + 'type'),
        DataFactory.namedNode(OWL + 'ObjectProperty'),
        graph
      );
    });

    it('should paste relationships to target node', () => {
      const copied: CopiedRelationship[] = [
        { from: 'NodeB', type: 'contains' },
        { from: 'NodeC', type: 'partOf' },
      ];

      const result = pasteRelationshipsToNode('NodeA', copied, store, rawData);

      expect(result.success).toBe(true);
      expect(result.addedEdges).toHaveLength(2);
      expect(result.failedEdges).toHaveLength(0);
      expect(rawData.edges).toHaveLength(2);
      
      const edge1 = rawData.edges.find(
        (e) => e.from === 'NodeB' && e.to === 'NodeA' && e.type === 'contains'
      );
      const edge2 = rawData.edges.find(
        (e) => e.from === 'NodeC' && e.to === 'NodeA' && e.type === 'partOf'
      );
      
      expect(edge1).toBeDefined();
      expect(edge2).toBeDefined();
    });

    it('should paste relationships with cardinality', () => {
      const copied: CopiedRelationship[] = [
        {
          from: 'NodeB',
          type: 'contains',
          minCardinality: 1,
          maxCardinality: 3,
        },
      ];

      const result = pasteRelationshipsToNode('NodeA', copied, store, rawData);

      expect(result.success).toBe(true);
      expect(result.addedEdges).toHaveLength(1);
      
      const edge = rawData.edges[0];
      expect(edge.minCardinality).toBe(1);
      expect(edge.maxCardinality).toBe(3);
    });

    it('should fail to paste duplicate edges', () => {
      // Add an existing edge
      rawData.edges = [{ from: 'NodeB', to: 'NodeA', type: 'contains' }];

      const copied: CopiedRelationship[] = [
        { from: 'NodeB', type: 'contains' },
      ];

      const result = pasteRelationshipsToNode('NodeA', copied, store, rawData);

      expect(result.success).toBe(false);
      expect(result.addedEdges).toHaveLength(0);
      expect(result.failedEdges).toHaveLength(1);
      expect(result.failedEdges[0].reason).toContain('already exists');
      expect(rawData.edges).toHaveLength(1); // Original edge still there
    });

    it('should handle partial success when some edges fail', () => {
      // Add one existing edge
      rawData.edges = [{ from: 'NodeB', to: 'NodeA', type: 'contains' }];

      const copied: CopiedRelationship[] = [
        { from: 'NodeB', type: 'contains' }, // Duplicate - should fail
        { from: 'NodeC', type: 'partOf' }, // New - should succeed
      ];

      const result = pasteRelationshipsToNode('NodeA', copied, store, rawData);

      expect(result.success).toBe(false); // Overall failure due to one failure
      expect(result.addedEdges).toHaveLength(1);
      expect(result.failedEdges).toHaveLength(1);
      expect(rawData.edges).toHaveLength(2); // Original + one new
    });

    it('should preserve onClass property when pasting', () => {
      const copied: CopiedRelationship[] = [
        {
          from: 'NodeB',
          type: 'contains',
          onClass: 'NodeC',
        },
      ];

      const result = pasteRelationshipsToNode('NodeA', copied, store, rawData);

      expect(result.success).toBe(true);
      const edge = rawData.edges[0];
      expect(edge.onClass).toBe('NodeC');
    });
  });
});
