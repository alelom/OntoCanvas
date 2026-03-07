import { describe, it, expect, beforeEach, vi } from 'vitest';
import { searchExternalClasses, fetchExternalOntologyClasses, clearExternalClassesCache, preloadExternalOntologyClasses, fetchExternalOntologyTtl, CorsOrNetworkError, type ExternalClassInfo, type ExternalOntologyReference } from './externalOntologySearch';

// Mock fetch globally
global.fetch = vi.fn();

describe('externalOntologySearch', () => {
  beforeEach(() => {
    clearExternalClassesCache();
    vi.clearAllMocks();
  });

  describe('searchExternalClasses', () => {
    it('should return empty array for empty query', async () => {
      const refs: ExternalOntologyReference[] = [];
      const results = await searchExternalClasses('', refs);
      expect(results).toEqual([]);
    });

    it('should return empty array for whitespace-only query', async () => {
      const refs: ExternalOntologyReference[] = [];
      const results = await searchExternalClasses('   ', refs);
      expect(results).toEqual([]);
    });

    it('should search case-insensitively', async () => {
      const mockClasses: ExternalClassInfo[] = [
        {
          uri: 'https://w3id.org/dano#AxisLine',
          localName: 'AxisLine',
          label: 'Axis Line',
          ontologyUrl: 'https://w3id.org/dano',
          prefix: 'dano',
        },
        {
          uri: 'https://w3id.org/dano#Composite',
          localName: 'Composite',
          label: 'Composite',
          ontologyUrl: 'https://w3id.org/dano',
          prefix: 'dano',
        },
      ];

      // Mock fetch to return empty (we'll test with mock data)
      (global.fetch as any).mockResolvedValue({
        ok: true,
        text: async () => '',
      });

      // We need to mock the actual fetchExternalOntologyClasses behavior
      // For now, let's test the search logic with direct data
      const refs: ExternalOntologyReference[] = [
        { url: 'https://w3id.org/dano', usePrefix: true, prefix: 'dano' },
      ];

      // Since we can't easily mock the internal fetch, let's test the search logic
      // by creating a test that uses the actual function but mocks the fetch response
      const mockTurtle = `
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix dano: <https://w3id.org/dano#> .

        dano:AxisLine a owl:Class ;
          rdfs:label "Axis Line" ;
          rdfs:comment "A line representing an axis" .

        dano:Composite a owl:Class ;
          rdfs:label "Composite" .
      `;

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        text: async () => mockTurtle,
        headers: {
          get: () => 'text/turtle',
        },
      });

      const results = await searchExternalClasses('a', refs);
      
      // Should find AxisLine (contains 'a') and Composite (contains 'a')
      expect(results.length).toBeGreaterThan(0);
      const axisLineResult = results.find((r) => r.localName === 'AxisLine');
      expect(axisLineResult).toBeDefined();
    });

    it('should match by localName', async () => {
      const mockTurtle = `
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix dano: <https://w3id.org/dano#> .

        dano:AxisLine a owl:Class ;
          rdfs:label "Axis Line" .
      `;

      const refs: ExternalOntologyReference[] = [
        { url: 'https://w3id.org/dano', usePrefix: true, prefix: 'dano' },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        text: async () => mockTurtle,
        headers: {
          get: () => 'text/turtle',
        },
      });

      const results = await searchExternalClasses('axis', refs);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.localName === 'AxisLine')).toBe(true);
    });

    it('should match by label', async () => {
      const mockTurtle = `
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix dano: <https://w3id.org/dano#> .

        dano:AxisLine a owl:Class ;
          rdfs:label "Axis Line" .
      `;

      const refs: ExternalOntologyReference[] = [
        { url: 'https://w3id.org/dano', usePrefix: true, prefix: 'dano' },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        text: async () => mockTurtle,
        headers: {
          get: () => 'text/turtle',
        },
      });

      const results = await searchExternalClasses('line', refs);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.label.toLowerCase().includes('line'))).toBe(true);
    });

    it('should prioritize exact matches', async () => {
      const mockTurtle = `
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix dano: <https://w3id.org/dano#> .

        dano:AxisLine a owl:Class ;
          rdfs:label "AxisLine" .

        dano:AxisLineExtended a owl:Class ;
          rdfs:label "AxisLineExtended" .
      `;

      const refs: ExternalOntologyReference[] = [
        { url: 'https://w3id.org/dano', usePrefix: true, prefix: 'dano' },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        text: async () => mockTurtle,
        headers: {
          get: () => 'text/turtle',
        },
      });

      const results = await searchExternalClasses('axisline', refs);
      expect(results.length).toBeGreaterThan(0);
      // Exact match should come first
      if (results.length > 1) {
        const firstResult = results[0];
        expect(firstResult.localName.toLowerCase() === 'axisline' || 
               firstResult.label.toLowerCase() === 'axisline').toBe(true);
      }
    });

    it('should search across multiple ontologies', async () => {
      const mockTurtle1 = `
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix dano: <https://w3id.org/dano#> .

        dano:AxisLine a owl:Class ;
          rdfs:label "Axis Line" .
      `;

      const mockTurtle2 = `
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix ex: <http://example.org/ontology#> .

        ex:AnotherClass a owl:Class ;
          rdfs:label "Another Class" .
      `;

      const refs: ExternalOntologyReference[] = [
        { url: 'https://w3id.org/dano', usePrefix: true, prefix: 'dano' },
        { url: 'http://example.org/ontology', usePrefix: true, prefix: 'ex' },
      ];

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          text: async () => mockTurtle1,
          headers: { get: () => 'text/turtle' },
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => mockTurtle2,
          headers: { get: () => 'text/turtle' },
        });

      const results = await searchExternalClasses('class', refs);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle single character queries', async () => {
      const mockTurtle = `
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix dano: <https://w3id.org/dano#> .

        dano:AxisLine a owl:Class ;
          rdfs:label "Axis Line" .

        dano:Composite a owl:Class ;
          rdfs:label "Composite" .

        dano:Dimension a owl:Class ;
          rdfs:label "Dimension" .
      `;

      const refs: ExternalOntologyReference[] = [
        { url: 'https://w3id.org/dano', usePrefix: true, prefix: 'dano' },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        text: async () => mockTurtle,
        headers: {
          get: () => 'text/turtle',
        },
      });

      const results = await searchExternalClasses('a', refs);
      // Should find all classes containing 'a' (AxisLine, Composite, Dimension)
      expect(results.length).toBeGreaterThan(0);
      const axisLineResult = results.find((r) => r.localName === 'AxisLine');
      expect(axisLineResult).toBeDefined();
    });
  });

  describe('fetchExternalOntologyClasses', () => {
    it('should cache results', async () => {
      const mockTurtle = `
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix dano: <https://w3id.org/dano#> .

        dano:AxisLine a owl:Class ;
          rdfs:label "Axis Line" .
      `;

      (global.fetch as any).mockResolvedValue({
        ok: true,
        text: async () => mockTurtle,
        headers: {
          get: () => 'text/turtle',
        },
      });

      const refs: ExternalOntologyReference[] = [
        { url: 'https://w3id.org/dano', usePrefix: true, prefix: 'dano' },
      ];

      // First call
      const result1 = await fetchExternalOntologyClasses('https://w3id.org/dano', refs);
      expect(result1.length).toBeGreaterThan(0);

      // Second call should use cache (fetch should only be called once)
      const result2 = await fetchExternalOntologyClasses('https://w3id.org/dano', refs);
      expect(result2.length).toBe(result1.length);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should return empty array on fetch error', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const result = await fetchExternalOntologyClasses('https://invalid-url.com', []);
      expect(result).toEqual([]);
    });

    it('should return empty array on HTTP error', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await fetchExternalOntologyClasses('https://w3id.org/dano', []);
      expect(result).toEqual([]);
    });

    it('should use content negotiation to request Turtle format', async () => {
      const turtleContent = `
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix dano: <https://w3id.org/dano#> .

        dano:AxisLine a owl:Class ;
          rdfs:label "Axis Line" .
      `;

      const mockFetch = vi.fn();
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => turtleContent,
        headers: {
          get: (name: string) => name === 'content-type' ? 'text/turtle' : null,
        },
      });
      global.fetch = mockFetch;

      const result = await fetchExternalOntologyClasses('https://w3id.org/dano', []);
      
      // Verify Accept header includes Turtle and other RDF formats for content negotiation
      expect(mockFetch).toHaveBeenCalledWith(
        'https://w3id.org/dano',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept': expect.stringContaining('text/turtle'),
          }),
          redirect: 'follow',
        })
      );
      
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle HTML response gracefully (content negotiation failure)', async () => {
      const htmlResponse = `<!DOCTYPE html>
<html>
<head><title>DAnO Ontology</title></head>
<body>
  <p>This is an HTML page, not RDF/Turtle content.</p>
</body>
</html>`;

      (global.fetch as any).mockResolvedValue({
        ok: true,
        text: async () => htmlResponse,
        headers: {
          get: (name: string) => name === 'content-type' ? 'text/html' : null,
        },
      });

      const result = await fetchExternalOntologyClasses('https://w3id.org/dano', []);
      // Should return empty array instead of throwing
      expect(result).toEqual([]);
    });

    it('should detect and skip HTML content before parsing', async () => {
      const htmlResponse = '<!DOCTYPE html><html><body>Not RDF</body></html>';

      (global.fetch as any).mockResolvedValue({
        ok: true,
        text: async () => htmlResponse,
        headers: {
          get: () => 'text/html',
        },
      });

      const result = await fetchExternalOntologyClasses('https://w3id.org/dano', []);
      expect(result).toEqual([]);
    });
  });

  describe('preloadExternalOntologyClasses', () => {
    it('should pre-fetch and cache all external ontologies', async () => {
      const mockTurtle1 = `
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix dano: <https://w3id.org/dano#> .

        dano:AxisLine a owl:Class ;
          rdfs:label "Axis Line" .
      `;

      const mockTurtle2 = `
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix ex: <http://example.org/ontology#> .

        ex:ExampleClass a owl:Class ;
          rdfs:label "Example Class" .
      `;

      const refs: ExternalOntologyReference[] = [
        { url: 'https://w3id.org/dano', usePrefix: true, prefix: 'dano' },
        { url: 'http://example.org/ontology', usePrefix: true, prefix: 'ex' },
      ];

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          text: async () => mockTurtle1,
          headers: {
            get: (name: string) => name === 'content-type' ? 'text/turtle' : null,
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => mockTurtle2,
          headers: {
            get: (name: string) => name === 'content-type' ? 'text/turtle' : null,
          },
        });

      await preloadExternalOntologyClasses(refs);

      // Verify both ontologies were fetched
      expect(global.fetch).toHaveBeenCalledTimes(2);
      
      // Verify classes are cached
      const danoClasses = await fetchExternalOntologyClasses('https://w3id.org/dano', refs);
      const exClasses = await fetchExternalOntologyClasses('http://example.org/ontology', refs);
      
      expect(danoClasses.length).toBeGreaterThan(0);
      expect(exClasses.length).toBeGreaterThan(0);
      
      // Verify cache is used (fetch should not be called again)
      const danoClasses2 = await fetchExternalOntologyClasses('https://w3id.org/dano', refs);
      expect(danoClasses2.length).toBe(danoClasses.length);
      expect(global.fetch).toHaveBeenCalledTimes(2); // Still 2, not 4
    });
  });

  describe('fetchExternalOntologyTtl with throwOnCors', () => {
    it('throws CorsOrNetworkError when fetch throws and throwOnCors is true', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('Failed to fetch'));
      await expect(
        fetchExternalOntologyTtl('https://example.com/ontology.ttl', { throwOnCors: true })
      ).rejects.toThrow(CorsOrNetworkError);
    });

    it('returns null when fetch throws and throwOnCors is false (default)', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('Failed to fetch'));
      const result = await fetchExternalOntologyTtl('https://example.com/ontology.ttl');
      expect(result).toBeNull();
    });
  });
});
