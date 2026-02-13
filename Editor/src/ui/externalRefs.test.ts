/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Store, DataFactory } from 'n3';
import {
  extractExternalRefsFromStore,
  extractPrefixesFromTtl,
  getNodeOntologyUrl,
  getNodePrefix,
  getObjectPropertyPrefix,
  formatNodeLabelWithPrefix,
  formatRelationshipLabelWithPrefix,
} from './externalRefs';
import type { GraphNode } from '../types';
import type { ExternalOntologyReference } from '../storage';

describe('externalRefs', () => {
  describe('extractExternalRefsFromStore', () => {
    it('should extract external references from owl:imports', () => {
      const store = new Store();
      const graph = DataFactory.defaultGraph();
      const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
      const OWL = 'http://www.w3.org/2002/07/owl#';
      
      // Add ontology
      const ontologyUri = DataFactory.namedNode('http://example.org/ontology#');
      store.addQuad(ontologyUri, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Ontology'), graph);
      
      // Add owl:imports
      const importUri = DataFactory.namedNode('https://w3id.org/dano');
      store.addQuad(ontologyUri, DataFactory.namedNode(OWL + 'imports'), importUri, graph);
      
      const refs = extractExternalRefsFromStore(store);
      expect(refs).toHaveLength(1);
      expect(refs[0].url).toBe('https://w3id.org/dano');
      expect(refs[0].usePrefix).toBe(true);
      expect(refs[0].prefix).toBe('dano');
    });
    
    it('should return empty array if no ontology found', () => {
      const store = new Store();
      const refs = extractExternalRefsFromStore(store);
      expect(refs).toHaveLength(0);
    });
  });
  
  describe('extractPrefixesFromTtl', () => {
    it('should extract prefix declarations', () => {
      const ttl = '@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .';
      const prefixes = extractPrefixesFromTtl(ttl);
      expect(prefixes).toEqual({
        rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        owl: 'http://www.w3.org/2002/07/owl#',
      });
    });
    
    it('should return empty object if no prefixes found', () => {
      const ttl = 'No prefixes here';
      const prefixes = extractPrefixesFromTtl(ttl);
      expect(prefixes).toEqual({});
    });
  });
  
  describe('getNodeOntologyUrl', () => {
    it('should extract ontology URL from comment', () => {
      const node: GraphNode = {
        id: 'test',
        label: 'Test',
        comment: 'Some comment (Imported from https://w3id.org/dano)',
      };
      const url = getNodeOntologyUrl(node);
      expect(url).toBe('https://w3id.org/dano');
    });
    
    it('should return null if no import comment', () => {
      const node: GraphNode = {
        id: 'test',
        label: 'Test',
        comment: 'Regular comment',
      };
      const url = getNodeOntologyUrl(node);
      expect(url).toBeNull();
    });
  });
  
  describe('getNodePrefix', () => {
    it('should return prefix for node from external ontology', () => {
      const node: GraphNode = {
        id: 'test',
        label: 'Test',
        comment: '(Imported from https://w3id.org/dano)',
      };
      const refs: ExternalOntologyReference[] = [
        { url: 'https://w3id.org/dano', usePrefix: true, prefix: 'dano' },
      ];
      const prefix = getNodePrefix(node, refs);
      expect(prefix).toBe('dano');
    });
    
    it('should return null if no matching reference', () => {
      const node: GraphNode = {
        id: 'test',
        label: 'Test',
        comment: '(Imported from https://example.org)',
      };
      const refs: ExternalOntologyReference[] = [
        { url: 'https://w3id.org/dano', usePrefix: true, prefix: 'dano' },
      ];
      const prefix = getNodePrefix(node, refs);
      expect(prefix).toBeNull();
    });
  });
  
  describe('formatNodeLabelWithPrefix', () => {
    it('should format label with prefix', () => {
      const node: GraphNode = {
        id: 'test',
        label: 'Test Node',
        comment: '(Imported from https://w3id.org/dano)',
      };
      const refs: ExternalOntologyReference[] = [
        { url: 'https://w3id.org/dano', usePrefix: true, prefix: 'dano' },
      ];
      const formatted = formatNodeLabelWithPrefix(node, refs);
      expect(formatted).toBe('dano: Test Node');
    });
    
    it('should return original label if no prefix', () => {
      const node: GraphNode = {
        id: 'test',
        label: 'Test Node',
      };
      const refs: ExternalOntologyReference[] = [];
      const formatted = formatNodeLabelWithPrefix(node, refs);
      expect(formatted).toBe('Test Node');
    });
  });
  
  describe('formatRelationshipLabelWithPrefix', () => {
    it('should format relationship label with prefix', () => {
      const refs: ExternalOntologyReference[] = [
        { url: 'https://w3id.org/dano', usePrefix: true, prefix: 'dano' },
      ];
      const formatted = formatRelationshipLabelWithPrefix('https://w3id.org/dano#contains', 'contains', refs);
      expect(formatted).toBe('dano: contains');
    });
    
    it('should return original label if no prefix', () => {
      const refs: ExternalOntologyReference[] = [];
      const formatted = formatRelationshipLabelWithPrefix('contains', 'contains', refs);
      expect(formatted).toBe('contains');
    });
  });
});
