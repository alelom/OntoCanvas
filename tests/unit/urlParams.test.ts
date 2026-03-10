import { describe, it, expect } from 'vitest';
import { getDisplayFileUrl, getAllDisplayFileUrls } from '../../src/utils/urlParams';

describe('urlParams', () => {
  describe('getDisplayFileUrl', () => {
    it('should construct display file URL from .ttl ontology URL', () => {
      const ontologyUrl = 'https://example.org/ontology.ttl';
      const displayUrl = getDisplayFileUrl(ontologyUrl);
      expect(displayUrl).toBe('https://example.org/ontology.display.json');
    });

    it('should construct display file URL from .html ontology URL', () => {
      const ontologyUrl = 'https://example.org/ontology.html';
      const displayUrl = getDisplayFileUrl(ontologyUrl);
      expect(displayUrl).toBe('https://example.org/ontology.display.json');
    });

    it('should construct display file URL from URL with path', () => {
      const ontologyUrl = 'https://example.org/path/to/ontology.ttl';
      const displayUrl = getDisplayFileUrl(ontologyUrl);
      expect(displayUrl).toBe('https://example.org/path/to/ontology.display.json');
    });

    it('should handle URLs without extension', () => {
      const ontologyUrl = 'https://example.org/ontology';
      const displayUrl = getDisplayFileUrl(ontologyUrl);
      expect(displayUrl).toBe('https://example.org/ontology.display.json');
    });

    it('should return null for invalid URLs', () => {
      const ontologyUrl = 'not-a-url';
      const displayUrl = getDisplayFileUrl(ontologyUrl);
      expect(displayUrl).toBeNull();
    });
  });

  describe('getAllDisplayFileUrls', () => {
    it('should return single URL for .ttl ontology URL', () => {
      const ontologyUrl = 'https://example.org/ontology.ttl';
      const displayUrls = getAllDisplayFileUrls(ontologyUrl);
      expect(displayUrls).toHaveLength(1);
      expect(displayUrls[0]).toBe('https://example.org/ontology.display.json');
    });

    it('should return display file URL for .html ontology URL', () => {
      const ontologyUrl = 'https://example.org/ontology.html';
      const displayUrls = getAllDisplayFileUrls(ontologyUrl);
      // Should return at least one URL (primary based on .html)
      expect(displayUrls.length).toBeGreaterThan(0);
      expect(displayUrls[0]).toBe('https://example.org/ontology.display.json');
    });

    it('should handle URLs with complex paths', () => {
      const ontologyUrl = 'https://burohappoldmachinelearning.github.io/ADIRO/aec_facade_domain.html';
      const displayUrls = getAllDisplayFileUrls(ontologyUrl);
      expect(displayUrls.length).toBeGreaterThan(0);
      expect(displayUrls[0]).toBe('https://burohappoldmachinelearning.github.io/ADIRO/aec_facade_domain.display.json');
    });

    it('should return empty array for invalid URLs', () => {
      const ontologyUrl = 'not-a-url';
      const displayUrls = getAllDisplayFileUrls(ontologyUrl);
      expect(displayUrls).toEqual([]);
    });
  });
});
