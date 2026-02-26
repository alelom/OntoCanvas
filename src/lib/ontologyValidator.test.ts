import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateRelationship,
  validateAllRelationships,
  type ValidationResult,
} from './ontologyValidator';
import { Store, DataFactory } from 'n3';
import type { CopiedRelationship } from './relationshipClipboard';
import type { GraphData } from '../types';

describe('ontologyValidator', () => {
  let store: Store;
  let rawData: GraphData;
  const BASE_IRI = 'http://example.org/aec-drawing-ontology#';
  const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  const OWL = 'http://www.w3.org/2002/07/owl#';
  const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';

  beforeEach(() => {
    store = new Store();
    rawData = {
      nodes: [
        { id: 'NodeA', label: 'Node A', labellableRoot: false },
        { id: 'NodeB', label: 'Node B', labellableRoot: false },
        { id: 'NodeC', label: 'Node C', labellableRoot: false },
        { id: 'NodeD', label: 'Node D', labellableRoot: false },
      ],
      edges: [],
    };

    const graph = DataFactory.defaultGraph();

    // Add classes to store
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
    store.addQuad(
      DataFactory.namedNode(BASE_IRI + 'NodeD'),
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

  describe('validateRelationship', () => {
    it('should validate relationship when no duplicate exists', () => {
      const edge: CopiedRelationship = {
        from: 'NodeB',
        type: 'contains',
      };

      const result = validateRelationship(edge, 'NodeA', 'NodeB', store, rawData);

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should reject duplicate relationship', () => {
      rawData.edges = [{ from: 'NodeB', to: 'NodeA', type: 'contains' }];

      const edge: CopiedRelationship = {
        from: 'NodeB',
        type: 'contains',
      };

      const result = validateRelationship(edge, 'NodeA', 'NodeB', store, rawData);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('already exists');
    });

    it('should validate relationship with domain constraint', () => {
      const graph = DataFactory.defaultGraph();
      
      // Set domain of 'contains' to NodeB
      store.addQuad(
        DataFactory.namedNode(BASE_IRI + 'contains'),
        DataFactory.namedNode(RDFS + 'domain'),
        DataFactory.namedNode(BASE_IRI + 'NodeB'),
        graph
      );

      const edge: CopiedRelationship = {
        from: 'NodeB', // Matches domain
        type: 'contains',
      };

      const result = validateRelationship(edge, 'NodeA', 'NodeB', store, rawData);

      expect(result.valid).toBe(true);
    });

    it('should reject relationship when source node does not match domain', () => {
      const graph = DataFactory.defaultGraph();
      
      // Set domain of 'contains' to NodeC
      store.addQuad(
        DataFactory.namedNode(BASE_IRI + 'contains'),
        DataFactory.namedNode(RDFS + 'domain'),
        DataFactory.namedNode(BASE_IRI + 'NodeC'),
        graph
      );

      const edge: CopiedRelationship = {
        from: 'NodeB', // Does NOT match domain (NodeC)
        type: 'contains',
      };

      const result = validateRelationship(edge, 'NodeA', 'NodeB', store, rawData);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('domain constraint');
    });

    it('should validate relationship with range constraint', () => {
      const graph = DataFactory.defaultGraph();
      
      // Set range of 'contains' to NodeA
      store.addQuad(
        DataFactory.namedNode(BASE_IRI + 'contains'),
        DataFactory.namedNode(RDFS + 'range'),
        DataFactory.namedNode(BASE_IRI + 'NodeA'),
        graph
      );

      const edge: CopiedRelationship = {
        from: 'NodeB',
        type: 'contains',
      };

      const result = validateRelationship(edge, 'NodeA', 'NodeB', store, rawData);

      expect(result.valid).toBe(true);
    });

    it('should reject relationship when target node does not match range', () => {
      const graph = DataFactory.defaultGraph();
      
      // Set range of 'contains' to NodeC
      store.addQuad(
        DataFactory.namedNode(BASE_IRI + 'contains'),
        DataFactory.namedNode(RDFS + 'range'),
        DataFactory.namedNode(BASE_IRI + 'NodeC'),
        graph
      );

      const edge: CopiedRelationship = {
        from: 'NodeB',
        type: 'contains',
      };

      const result = validateRelationship(edge, 'NodeA', 'NodeB', store, rawData);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('range constraint');
    });

    it('should handle subclass relationships in domain validation', () => {
      const graph = DataFactory.defaultGraph();
      
      // Make NodeB a subclass of NodeC
      store.addQuad(
        DataFactory.namedNode(BASE_IRI + 'NodeB'),
        DataFactory.namedNode(RDFS + 'subClassOf'),
        DataFactory.namedNode(BASE_IRI + 'NodeC'),
        graph
      );

      // Set domain of 'contains' to NodeC
      store.addQuad(
        DataFactory.namedNode(BASE_IRI + 'contains'),
        DataFactory.namedNode(RDFS + 'domain'),
        DataFactory.namedNode(BASE_IRI + 'NodeC'),
        graph
      );

      const edge: CopiedRelationship = {
        from: 'NodeB', // Subclass of NodeC, should match domain
        type: 'contains',
      };

      const result = validateRelationship(edge, 'NodeA', 'NodeB', store, rawData);

      expect(result.valid).toBe(true);
    });

    it('should handle external property URIs', () => {
      const externalUri = 'https://w3id.org/dano#contains';
      const graph = DataFactory.defaultGraph();
      
      // Add external property
      store.addQuad(
        DataFactory.namedNode(externalUri),
        DataFactory.namedNode(RDF + 'type'),
        DataFactory.namedNode(OWL + 'ObjectProperty'),
        graph
      );

      const edge: CopiedRelationship = {
        from: 'NodeB',
        type: externalUri,
      };

      const result = validateRelationship(edge, 'NodeA', 'NodeB', store, rawData);

      expect(result.valid).toBe(true);
    });

    it('should allow any class when domain is owl:Thing', () => {
      const graph = DataFactory.defaultGraph();
      
      // Set domain of 'contains' to owl:Thing (top-level class)
      store.addQuad(
        DataFactory.namedNode(BASE_IRI + 'contains'),
        DataFactory.namedNode(RDFS + 'domain'),
        DataFactory.namedNode(OWL + 'Thing'),
        graph
      );

      const edge: CopiedRelationship = {
        from: 'NodeB',
        type: 'contains',
      };

      const result = validateRelationship(edge, 'NodeA', 'NodeB', store, rawData);

      expect(result.valid).toBe(true);
    });

    it('should allow any class when range is owl:Thing', () => {
      const graph = DataFactory.defaultGraph();
      
      // Set range of 'contains' to owl:Thing (top-level class)
      store.addQuad(
        DataFactory.namedNode(BASE_IRI + 'contains'),
        DataFactory.namedNode(RDFS + 'range'),
        DataFactory.namedNode(OWL + 'Thing'),
        graph
      );

      const edge: CopiedRelationship = {
        from: 'NodeB',
        type: 'contains',
      };

      const result = validateRelationship(edge, 'NodeA', 'NodeB', store, rawData);

      expect(result.valid).toBe(true);
    });
  });

  describe('validateAllRelationships', () => {
    it('should validate all relationships successfully', () => {
      const relationships: CopiedRelationship[] = [
        { from: 'NodeB', type: 'contains' },
        { from: 'NodeC', type: 'partOf' },
      ];

      const results = validateAllRelationships(relationships, 'NodeA', store, rawData);

      expect(results).toHaveLength(2);
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(true);
    });

    it('should identify which relationships fail validation', () => {
      rawData.edges = [{ from: 'NodeB', to: 'NodeA', type: 'contains' }];

      const relationships: CopiedRelationship[] = [
        { from: 'NodeB', type: 'contains' }, // Duplicate - should fail
        { from: 'NodeC', type: 'partOf' }, // Valid - should pass
      ];

      const results = validateAllRelationships(relationships, 'NodeA', store, rawData);

      expect(results).toHaveLength(2);
      expect(results[0].valid).toBe(false);
      expect(results[0].reason).toContain('already exists');
      expect(results[1].valid).toBe(true);
    });

    it('should handle empty array', () => {
      const relationships: CopiedRelationship[] = [];

      const results = validateAllRelationships(relationships, 'NodeA', store, rawData);

      expect(results).toEqual([]);
    });
  });
});
