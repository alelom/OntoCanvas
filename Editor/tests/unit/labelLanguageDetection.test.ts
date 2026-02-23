import { describe, it, expect } from 'vitest';
import { Store, Parser, DataFactory } from 'n3';
import { detectAvailableLanguages, getLabelsForResource } from '../../src/ui/labelLanguageDetection';

describe('labelLanguageDetection', () => {
  describe('detectAvailableLanguages', () => {
    it('should detect languages from rdfs:label quads', () => {
      const store = new Store();
      const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
      const subject = DataFactory.namedNode('http://example.org/Test');
      
      store.addQuad(
        subject,
        DataFactory.namedNode(RDFS + 'label'),
        DataFactory.literal('Test', 'en'),
        DataFactory.defaultGraph()
      );
      store.addQuad(
        subject,
        DataFactory.namedNode(RDFS + 'label'),
        DataFactory.literal('Teste', 'pt'),
        DataFactory.defaultGraph()
      );
      store.addQuad(
        subject,
        DataFactory.namedNode(RDFS + 'label'),
        DataFactory.literal('Test', 'fr'),
        DataFactory.defaultGraph()
      );
      
      const languages = detectAvailableLanguages(store);
      expect(languages).toEqual(['en', 'fr', 'pt']);
    });
    
    it('should default to en if no language tags found', () => {
      const store = new Store();
      const languages = detectAvailableLanguages(store);
      expect(languages).toEqual(['en']);
    });
    
    it('should handle labels without language tags', () => {
      const store = new Store();
      const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
      const subject = DataFactory.namedNode('http://example.org/Test');
      
      store.addQuad(
        subject,
        DataFactory.namedNode(RDFS + 'label'),
        DataFactory.literal('Test'), // No language tag
        DataFactory.defaultGraph()
      );
      
      const languages = detectAvailableLanguages(store);
      expect(languages).toEqual(['en']);
    });
    
    it('should return sorted languages', () => {
      const store = new Store();
      const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
      const subject = DataFactory.namedNode('http://example.org/Test');
      
      store.addQuad(
        subject,
        DataFactory.namedNode(RDFS + 'label'),
        DataFactory.literal('Test', 'z'),
        DataFactory.defaultGraph()
      );
      store.addQuad(
        subject,
        DataFactory.namedNode(RDFS + 'label'),
        DataFactory.literal('Test', 'a'),
        DataFactory.defaultGraph()
      );
      store.addQuad(
        subject,
        DataFactory.namedNode(RDFS + 'label'),
        DataFactory.literal('Test', 'm'),
        DataFactory.defaultGraph()
      );
      
      const languages = detectAvailableLanguages(store);
      expect(languages).toEqual(['a', 'm', 'z']);
    });
  });
  
  describe('getLabelsForResource', () => {
    it('should get all labels for a resource', () => {
      const store = new Store();
      const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
      const resourceUri = 'http://example.org/Test';
      const subject = DataFactory.namedNode(resourceUri);
      
      store.addQuad(
        subject,
        DataFactory.namedNode(RDFS + 'label'),
        DataFactory.literal('Test', 'en'),
        DataFactory.defaultGraph()
      );
      store.addQuad(
        subject,
        DataFactory.namedNode(RDFS + 'label'),
        DataFactory.literal('Teste', 'pt'),
        DataFactory.defaultGraph()
      );
      
      const labels = getLabelsForResource(store, resourceUri);
      expect(labels.get('en')).toBe('Test');
      expect(labels.get('pt')).toBe('Teste');
    });
    
    it('should treat labels without language tags as en', () => {
      const store = new Store();
      const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
      const resourceUri = 'http://example.org/Test';
      const subject = DataFactory.namedNode(resourceUri);
      
      store.addQuad(
        subject,
        DataFactory.namedNode(RDFS + 'label'),
        DataFactory.literal('Test'), // No language tag
        DataFactory.defaultGraph()
      );
      
      const labels = getLabelsForResource(store, resourceUri);
      expect(labels.get('en')).toBe('Test');
    });
    
    it('should return empty map if no labels found', () => {
      const store = new Store();
      const resourceUri = 'http://example.org/Test';
      
      const labels = getLabelsForResource(store, resourceUri);
      expect(labels.size).toBe(0);
    });
  });
});
