/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getDisplayFileUrl,
  getAllDisplayFileUrls,
  convertOntologyUrlToHtmlUrl,
  clearOntologyParamsFromAddressBar,
} from '../../src/utils/urlParams';

describe('urlParams', () => {
  describe('clearOntologyParamsFromAddressBar', () => {
    let replaceStateSpy: ReturnType<typeof vi.spyOn>;
    const originalLocation = window.location;

    beforeEach(() => {
      replaceStateSpy = vi.spyOn(window.history, 'replaceState');
    });

    afterEach(() => {
      replaceStateSpy.mockRestore();
      Object.defineProperty(window, 'location', { value: originalLocation, configurable: true });
    });

    function mockLocation(href: string): void {
      const url = new URL(href);
      Object.defineProperty(window, 'location', {
        value: {
          ...originalLocation,
          href,
          pathname: url.pathname,
          search: url.search,
          hash: url.hash,
        },
        configurable: true,
      });
    }

    it('removes onto param from URL so address bar reflects local file open', () => {
      const urlWithOnto = 'https://alelom.github.io/OntoCanvas/?onto=https://rub-informatik-im-bauwesen.github.io/dano/';
      mockLocation(urlWithOnto);

      clearOntologyParamsFromAddressBar();

      expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/OntoCanvas/');
    });

    it('removes localFile param from URL', () => {
      const urlWithLocalFile = 'https://example.com/?localFile=abc123';
      mockLocation(urlWithLocalFile);

      clearOntologyParamsFromAddressBar();

      expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/');
    });

    it('removes both onto and localFile params when present', () => {
      const urlWithBoth = 'https://example.com/path?onto=https://other.org/&localFile=token';
      mockLocation(urlWithBoth);

      clearOntologyParamsFromAddressBar();

      expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/path');
    });

    it('does not call replaceState when URL has no onto or localFile params', () => {
      mockLocation('https://example.com/');
      replaceStateSpy.mockClear();

      clearOntologyParamsFromAddressBar();

      expect(replaceStateSpy).not.toHaveBeenCalled();
    });

    it('preserves other query params and hash when removing onto', () => {
      mockLocation('https://example.com/?onto=https://other.org/&foo=bar#section');

      clearOntologyParamsFromAddressBar();

      expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/?foo=bar#section');
    });
  });

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

  describe('convertOntologyUrlToHtmlUrl', () => {
    it('should convert ontology URL with hyphens to HTML URL with underscores', () => {
      const ontologyUrl = 'https://burohappoldmachinelearning.github.io/ADIRO/aec-drawing-metadata';
      const htmlUrl = convertOntologyUrlToHtmlUrl(ontologyUrl);
      expect(htmlUrl).toBe('https://burohappoldmachinelearning.github.io/ADIRO/aec_drawing_metadata.html');
    });

    it('should convert ontology URL with hyphens and add .html extension', () => {
      const ontologyUrl = 'https://example.org/ontology-name';
      const htmlUrl = convertOntologyUrlToHtmlUrl(ontologyUrl);
      expect(htmlUrl).toBe('https://example.org/ontology_name.html');
    });

    it('should handle URLs with multiple hyphens', () => {
      const ontologyUrl = 'https://example.org/my-ontology-name-here';
      const htmlUrl = convertOntologyUrlToHtmlUrl(ontologyUrl);
      expect(htmlUrl).toBe('https://example.org/my_ontology_name_here.html');
    });

    it('should remove existing extension before converting', () => {
      const ontologyUrl = 'https://example.org/ontology-name.ttl';
      const htmlUrl = convertOntologyUrlToHtmlUrl(ontologyUrl);
      expect(htmlUrl).toBe('https://example.org/ontology_name.html');
    });

    it('should handle URLs with path segments', () => {
      const ontologyUrl = 'https://example.org/path/to/ontology-name';
      const htmlUrl = convertOntologyUrlToHtmlUrl(ontologyUrl);
      expect(htmlUrl).toBe('https://example.org/path/to/ontology_name.html');
    });

    it('should handle URLs with trailing slash', () => {
      const ontologyUrl = 'https://example.org/ontology-name/';
      const htmlUrl = convertOntologyUrlToHtmlUrl(ontologyUrl);
      expect(htmlUrl).toBe('https://example.org/ontology_name.html');
    });

    it('should handle URLs without hyphens (just add .html)', () => {
      const ontologyUrl = 'https://example.org/ontology';
      const htmlUrl = convertOntologyUrlToHtmlUrl(ontologyUrl);
      expect(htmlUrl).toBe('https://example.org/ontology.html');
    });

    it('should return null for invalid URLs', () => {
      const ontologyUrl = 'not-a-url';
      const htmlUrl = convertOntologyUrlToHtmlUrl(ontologyUrl);
      expect(htmlUrl).toBeNull();
    });

    it('should return null for URLs with empty filename', () => {
      const ontologyUrl = 'https://example.org/';
      const htmlUrl = convertOntologyUrlToHtmlUrl(ontologyUrl);
      expect(htmlUrl).toBeNull();
    });

    it('should handle the specific case from the issue', () => {
      const ontologyUrl = 'https://burohappoldmachinelearning.github.io/ADIRO/aec-drawing-metadata';
      const htmlUrl = convertOntologyUrlToHtmlUrl(ontologyUrl);
      expect(htmlUrl).toBe('https://burohappoldmachinelearning.github.io/ADIRO/aec_drawing_metadata.html');
    });
  });
});
