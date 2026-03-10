/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { Store, DataFactory } from 'n3';
import {
  extractExternalRefsFromStore,
  extractUsedNamespaceRefsFromStore,
  extractPrefixesFromTtl,
  getNodeOntologyUrl,
  getNodePrefix,
  getObjectPropertyPrefix,
  formatNodeLabelWithPrefix,
  formatRelationshipLabelWithPrefix,
  sortExternalRefsByUrl,
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
    
    it('returns empty when store has no owl:imports', () => {
      const store = new Store();
      const refs = extractExternalRefsFromStore(store);
      expect(refs).toHaveLength(0);
    });

    it('extracts refs from owl:imports regardless of subject (regression: parser ontology node mismatch)', () => {
      const store = new Store();
      const graph = DataFactory.defaultGraph();
      const OWL = 'http://www.w3.org/2002/07/owl#';
      // Use a different subject (e.g. blank or another IRI) - old code required ontology subject
      const someSubject = DataFactory.namedNode('http://example.org/other#Ontology');
      const importUri = DataFactory.namedNode('https://w3id.org/dano');
      store.addQuad(someSubject, DataFactory.namedNode(OWL + 'imports'), importUri, graph);
      const refs = extractExternalRefsFromStore(store);
      expect(refs).toHaveLength(1);
      expect(refs[0].url).toBe('https://w3id.org/dano');
      expect(refs[0].prefix).toBe('dano');
    });

    it('deduplicates same URL when multiple owl:imports quads exist', () => {
      const store = new Store();
      const graph = DataFactory.defaultGraph();
      const OWL = 'http://www.w3.org/2002/07/owl#';
      const subj1 = DataFactory.namedNode('http://ex.org/ont1');
      const subj2 = DataFactory.namedNode('http://ex.org/ont2');
      const importUri = DataFactory.namedNode('https://w3id.org/dano');
      store.addQuad(subj1, DataFactory.namedNode(OWL + 'imports'), importUri, graph);
      store.addQuad(subj2, DataFactory.namedNode(OWL + 'imports'), importUri, graph);
      const refs = extractExternalRefsFromStore(store);
      expect(refs).toHaveLength(1);
      expect(refs[0].url).toBe('https://w3id.org/dano');
    });
  });

  describe('extractUsedNamespaceRefsFromStore', () => {
    it('returns external refs from namespaces used in quads (DANO-like: no owl:imports)', () => {
      const store = new Store();
      const graph = DataFactory.defaultGraph();
      const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
      const OWL = 'http://www.w3.org/2002/07/owl#';
      const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
      const DC = 'http://purl.org/dc/terms/';
      const GEO = 'http://www.opengis.net/ont/geosparql#';
      const SCHEMA = 'https://schema.org/';
      const main = 'https://w3id.org/dano#';
      const mainSubject = DataFactory.namedNode('https://w3id.org/dano');
      const danoClass = DataFactory.namedNode('https://w3id.org/dano#DrawingElement');
      store.addQuad(mainSubject, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Ontology'), graph);
      store.addQuad(mainSubject, DataFactory.namedNode(DC + 'title'), DataFactory.literal('DAnO'), graph);
      store.addQuad(danoClass, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Class'), graph);
      store.addQuad(danoClass, DataFactory.namedNode(RDFS + 'label'), DataFactory.literal('Drawing Element'), graph);
      store.addQuad(danoClass, DataFactory.namedNode(GEO + 'hasGeometry'), DataFactory.namedNode(GEO + 'Geometry'), graph);
      store.addQuad(DataFactory.namedNode(SCHEMA + 'Person'), DataFactory.namedNode(RDFS + 'label'), DataFactory.literal('Person'), graph);
      const refs = extractUsedNamespaceRefsFromStore(store, main);
      const urls = refs.map((r) => (r.url.endsWith('#') ? r.url.slice(0, -1) : r.url.replace(/\/$/, '')));
      expect(urls).toContain('http://purl.org/dc/terms');
      expect(urls).toContain('http://www.opengis.net/ont/geosparql');
      expect(urls).toContain('https://schema.org');
      expect(urls).not.toContain('https://w3id.org/dano');
      expect(urls).not.toContain('http://www.w3.org/2002/07/owl');
      expect(refs.some((r) => r.prefix === 'geo')).toBe(true);
      expect(refs.some((r) => r.prefix === 'schema')).toBe(true);
    });

    it('excludes main ontology namespace from refs', () => {
      const store = new Store();
      const graph = DataFactory.defaultGraph();
      const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
      const OWL = 'http://www.w3.org/2002/07/owl#';
      const mainSubject = DataFactory.namedNode('http://example.org/ont#');
      store.addQuad(mainSubject, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Ontology'), graph);
      const refs = extractUsedNamespaceRefsFromStore(store, 'http://example.org/ont#');
      expect(refs).toHaveLength(0);
    });

    it('excludes non-vocabulary namespaces (ORCID, license, staff URLs)', () => {
      const store = new Store();
      const graph = DataFactory.defaultGraph();
      const main = 'https://w3id.org/dano#';
      const schema = 'https://schema.org/';
      store.addQuad(
        DataFactory.namedNode('https://w3id.org/dano'),
        DataFactory.namedNode(schema + 'creator'),
        DataFactory.namedNode('https://orcid.org/0000-0002-8685-436X'),
        graph
      );
      store.addQuad(
        DataFactory.namedNode('https://w3id.org/dano'),
        DataFactory.namedNode('http://purl.org/dc/terms/license'),
        DataFactory.namedNode('https://creativecommons.org/licenses/by/4.0/'),
        graph
      );
      store.addQuad(
        DataFactory.namedNode('https://w3id.org/dano'),
        DataFactory.namedNode(schema + 'publisher'),
        DataFactory.namedNode('https://www.inf.bi.ruhr-uni-bochum.de/iib/lehrstuhl/mitarbeiter/phillip_schoenfelder.html.en'),
        graph
      );
      const refs = extractUsedNamespaceRefsFromStore(store, main);
      const urls = refs.map((r) => r.url);
      expect(urls.some((u) => u.includes('orcid.org'))).toBe(false);
      expect(urls.some((u) => u.includes('creativecommons.org'))).toBe(false);
      expect(urls.some((u) => u.includes('ruhr-uni-bochum') || u.includes('inf.bi.'))).toBe(false);
    });

    it('consolidates GeoSPARQL doc/def namespaces to canonical ont/geosparql', () => {
      const store = new Store();
      const graph = DataFactory.defaultGraph();
      const main = 'https://w3id.org/dano#';
      const geo = 'http://www.opengis.net/ont/geosparql#';
      store.addQuad(DataFactory.namedNode(geo + 'hasGeometry'), DataFactory.namedNode(geo + 'hasGeometry'), DataFactory.namedNode(geo + 'Geometry'), graph);
      store.addQuad(
        DataFactory.namedNode(geo + 'Feature'),
        DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#seeAlso'),
        DataFactory.namedNode('http://www.opengis.net/doc/IS/geosparql/1.0'),
        graph
      );
      store.addQuad(
        DataFactory.namedNode(geo + 'Geometry'),
        DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#seeAlso'),
        DataFactory.namedNode('http://www.opengis.net/def/function/ogc-geosparql/1.0'),
        graph
      );
      const refs = extractUsedNamespaceRefsFromStore(store, main);
      const geoRefs = refs.filter((r) => r.prefix === 'geo' || r.url.includes('opengis.net'));
      expect(geoRefs).toHaveLength(1);
      expect(geoRefs[0].url).toMatch(/opengis\.net\/ont\/geosparql/);
      expect(geoRefs[0].url).not.toMatch(/\/$/);
      expect(refs.some((r) => r.url.includes('opengis.net/doc/') || r.url.includes('opengis.net/def/'))).toBe(false);
    });

    it('maps parent path http://www.opengis.net/ont to canonical geosparql (no duplicate)', () => {
      const store = new Store();
      const graph = DataFactory.defaultGraph();
      const main = 'https://w3id.org/dano#';
      store.addQuad(
        DataFactory.namedNode('http://www.opengis.net/ont/geosparql'),
        DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        DataFactory.namedNode('http://www.w3.org/2002/07/owl#Ontology'),
        graph
      );
      store.addQuad(
        DataFactory.namedNode('http://www.opengis.net/ont/geosparql#hasGeometry'),
        DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        DataFactory.namedNode('http://www.w3.org/2002/07/owl#ObjectProperty'),
        graph
      );
      const refs = extractUsedNamespaceRefsFromStore(store, main);
      const opengisRefs = refs.filter((r) => r.url.includes('opengis.net'));
      expect(opengisRefs).toHaveLength(1);
      expect(opengisRefs[0].url).toMatch(/^http:\/\/www\.opengis\.net\/ont\/geosparql(#)?$/);
      expect(refs.some((r) => r.url === 'http://www.opengis.net/ont' || r.url === 'http://www.opengis.net/ont#')).toBe(false);
    });

    it('excludes github.com and ietf.org; consolidates dc/elements to dc/elements/1.1; ref URLs have no trailing slash', () => {
      const store = new Store();
      const graph = DataFactory.defaultGraph();
      const main = 'https://w3id.org/dano#';
      const dc11 = 'http://purl.org/dc/elements/1.1/';
      const dcelements = 'http://purl.org/dc/elements/';
      store.addQuad(
        DataFactory.namedNode('https://w3id.org/dano'),
        DataFactory.namedNode('http://purl.org/dc/terms/source'),
        DataFactory.namedNode('https://github.com/RUB-Informatik-im-Bauwesen/dano'),
        graph
      );
      store.addQuad(DataFactory.namedNode(dc11 + 'title'), DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#seeAlso'), DataFactory.namedNode('http://www.ietf.org/rfc/rfc4646.txt'), graph);
      store.addQuad(DataFactory.namedNode(dc11 + 'coverage'), DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#Property'), graph);
      store.addQuad(DataFactory.namedNode(dcelements + 'format'), DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#label'), DataFactory.literal('Format'), graph);
      const refs = extractUsedNamespaceRefsFromStore(store, main);
      expect(refs.some((r) => r.url.includes('github.com'))).toBe(false);
      expect(refs.some((r) => r.url.includes('ietf.org'))).toBe(false);
      const dcElementRefs = refs.filter((r) => r.url.includes('purl.org/dc/elements'));
      expect(dcElementRefs).toHaveLength(1);
      expect(dcElementRefs[0].url).toBe('http://purl.org/dc/elements/1.1');
      refs.forEach((r) => expect(r.url.endsWith('/')).toBe(false));
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
      expect(formatted).toBe('dano:contains');
    });
    
    it('should return original label if no prefix', () => {
      const refs: ExternalOntologyReference[] = [];
      const formatted = formatRelationshipLabelWithPrefix('contains', 'contains', refs);
      expect(formatted).toBe('contains');
    });
  });

  describe('sortExternalRefsByUrl', () => {
    it('sorts refs alphabetically by URL so purl.org/dc and purl.org/vocab are adjacent', () => {
      const refs: ExternalOntologyReference[] = [
        { url: 'http://www.opengis.net/ont/geosparql', usePrefix: true, prefix: 'geo' },
        { url: 'http://purl.org/vocab/vann', usePrefix: true, prefix: 'vann' },
        { url: 'http://purl.org/dc/elements/1.1', usePrefix: true, prefix: 'dc' },
      ];
      sortExternalRefsByUrl(refs);
      expect(refs.map((r) => r.url)).toEqual([
        'http://purl.org/dc/elements/1.1',
        'http://purl.org/vocab/vann',
        'http://www.opengis.net/ont/geosparql',
      ]);
    });
  });
});
