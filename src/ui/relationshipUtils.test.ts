/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAllRelationshipTypes,
  cleanupUnusedExternalProperties,
  getRelationshipLabel,
  getEdgeDisplayLabel,
  getRelationshipComment,
  getAllEdgeTypes,
  getPropertyHasCardinality,
  SUBCLASSOF_COMMENT,
} from './relationshipUtils';
import type { GraphData, GraphEdge } from '../types';
import type { ExternalOntologyReference } from '../storage';
import type { ExternalObjectPropertyInfo } from '../externalOntologySearch';

describe('relationshipUtils', () => {
  let rawData: GraphData;
  let objectProperties: Array<{ name: string; label: string; hasCardinality: boolean; comment?: string | null }>;
  let externalRefs: ExternalOntologyReference[];
  
  beforeEach(() => {
    rawData = {
      nodes: [
        { id: 'NodeA', label: 'Node A' },
        { id: 'NodeB', label: 'Node B' },
      ],
      edges: [
        { from: 'NodeA', to: 'NodeB', type: 'subClassOf' },
        { from: 'NodeA', to: 'NodeB', type: 'contains' },
      ],
    };
    
    objectProperties = [
      { name: 'contains', label: 'Contains', hasCardinality: true, comment: 'Contains relationship' },
      { name: 'partOf', label: 'Part Of', hasCardinality: true },
    ];
    
    externalRefs = [
      { url: 'https://w3id.org/dano', usePrefix: true, prefix: 'dano' },
    ];
  });
  
  describe('getAllRelationshipTypes', () => {
    it('should return all relationship types including subClassOf', () => {
      const types = getAllRelationshipTypes(rawData, objectProperties);
      expect(types).toContain('subClassOf');
      expect(types).toContain('contains');
      expect(types).toContain('partOf');
    });
    
    it('should always include external properties even if not used in edges', () => {
      objectProperties.push({
        name: 'https://w3id.org/dano#hasPart',
        label: 'Has Part',
        hasCardinality: true,
      });
      const types = getAllRelationshipTypes(rawData, objectProperties);
      // External properties are always included (they may be referenced in restrictions or domain/range)
      expect(types).toContain('https://w3id.org/dano#hasPart');
    });
  });
  
  describe('cleanupUnusedExternalProperties', () => {
    it('should remove unused external properties', () => {
      objectProperties.push({
        name: 'https://w3id.org/dano#unused',
        label: 'Unused',
        hasCardinality: true,
      });
      const cleaned = cleanupUnusedExternalProperties(rawData, objectProperties);
      expect(cleaned.find(p => p.name === 'https://w3id.org/dano#unused')).toBeUndefined();
      expect(cleaned.find(p => p.name === 'contains')).toBeDefined();
    });
    
    it('should keep local properties', () => {
      const cleaned = cleanupUnusedExternalProperties(rawData, objectProperties);
      expect(cleaned.find(p => p.name === 'contains')).toBeDefined();
      expect(cleaned.find(p => p.name === 'partOf')).toBeDefined();
    });
  });
  
  describe('getRelationshipLabel', () => {
    it('should return label for known property', () => {
      const label = getRelationshipLabel('contains', objectProperties, externalRefs);
      expect(label).toBe('Contains');
    });
    
    it('should return subClassOf for subClassOf type', () => {
      const label = getRelationshipLabel('subClassOf', objectProperties, externalRefs);
      expect(label).toBe('subClassOf');
    });
    
    it('should extract local name from URI if not found', () => {
      const label = getRelationshipLabel('https://w3id.org/dano#contains', objectProperties, externalRefs);
      expect(label).toBe('contains');
    });
  });
  
  describe('getEdgeDisplayLabel', () => {
    it('should return base label without cardinality', () => {
      const edge: GraphEdge = {
        from: 'NodeA',
        to: 'NodeB',
        type: 'contains',
      };
      const label = getEdgeDisplayLabel(edge, objectProperties, externalRefs);
      expect(label).toBe('Contains');
    });
    
    it('should include cardinality in label', () => {
      const edge: GraphEdge = {
        from: 'NodeA',
        to: 'NodeB',
        type: 'contains',
        minCardinality: 1,
        maxCardinality: 2,
      };
      const label = getEdgeDisplayLabel(edge, objectProperties, externalRefs);
      expect(label).toBe('Contains [1..2]');
    });
  });
  
  describe('getRelationshipComment', () => {
    it('should return comment for known property', () => {
      const comment = getRelationshipComment('contains', objectProperties);
      expect(comment).toBe('Contains relationship');
    });
    
    it('should return SUBCLASSOF_COMMENT for subClassOf', () => {
      const comment = getRelationshipComment('subClassOf', objectProperties);
      expect(comment).toBe(SUBCLASSOF_COMMENT);
    });
    
    it('should return null for unknown property', () => {
      const comment = getRelationshipComment('unknown', objectProperties);
      expect(comment).toBeNull();
    });
  });
  
  describe('getAllEdgeTypes', () => {
    it('should return all edge types from properties and edges', () => {
      const types = getAllEdgeTypes(rawData, objectProperties);
      expect(types).toContain('subClassOf');
      expect(types).toContain('contains');
      expect(types).toContain('partOf');
    });
  });
  
  describe('getPropertyHasCardinality', () => {
    it('should return false for subClassOf', () => {
      const hasCard = getPropertyHasCardinality('subClassOf', objectProperties, null);
      expect(hasCard).toBe(false);
    });
    
    it('should return true for property with cardinality', () => {
      const hasCard = getPropertyHasCardinality('contains', objectProperties, null);
      expect(hasCard).toBe(true);
    });
    
    it('should use external property hasCardinality if provided', () => {
      const externalProp: ExternalObjectPropertyInfo = {
        uri: 'https://w3id.org/dano#hasPart',
        label: 'Has Part',
        hasCardinality: false,
      };
      const hasCard = getPropertyHasCardinality('https://w3id.org/dano#hasPart', objectProperties, externalProp);
      expect(hasCard).toBe(false);
    });
  });
});
