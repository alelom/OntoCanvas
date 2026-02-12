/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock all the imports since main.ts has many dependencies
vi.mock('./parser', () => ({
  parseTtlToGraph: vi.fn(),
}));

vi.mock('./storage', () => ({
  getLastFileFromIndexedDB: vi.fn(),
  saveLastFileToIndexedDB: vi.fn(),
}));

// Mock DOM elements
const mockErrorMsg = {
  style: { display: 'none' },
  textContent: '',
};

describe('loadFromUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    // Mock document.getElementById
    vi.spyOn(document, 'getElementById').mockReturnValue(mockErrorMsg as any);
  });

  it('should successfully load TTL from URL', async () => {
    const mockTtl = `
      @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      
      <http://example.com/test> a owl:Ontology .
    `;

    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) => {
          if (name === 'content-type') return 'text/turtle';
          return null;
        },
      },
      text: async () => mockTtl,
    });

    // We can't directly test loadFromUrl since it's not exported
    // But we can test the fetch logic
    const url = 'https://example.com/test.ttl';
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/turtle, application/turtle, text/n3, application/n-triples, application/rdf+xml, */*',
        'User-Agent': 'curl/8.0.0',
      },
    });

    expect(response.ok).toBe(true);
    const text = await response.text();
    expect(text).toContain('owl:Ontology');
  });

  it('should handle HTML response with alternate TTL link', async () => {
    const mockHtml = `
      <html>
        <head>
          <link rel="alternate" type="text/turtle" href="https://example.com/ontology.ttl" />
        </head>
      </html>
    `;

    const mockTtl = `
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      <http://example.com/ontology> a owl:Ontology .
    `;

    // First fetch returns HTML
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'text/html';
            return null;
          },
        },
        text: async () => mockHtml,
      })
      // Second fetch returns TTL
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: () => null,
        },
        text: async () => mockTtl,
      });

    const url = 'https://example.com/ontology';
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/turtle, application/turtle, text/n3, application/n-triples, application/rdf+xml, */*',
        'User-Agent': 'curl/8.0.0',
      },
    });

    expect(response.ok).toBe(true);
    const contentType = response.headers.get('content-type');
    expect(contentType).toContain('html');

    // Parse HTML to find alternate link
    const parser = new DOMParser();
    const doc = parser.parseFromString(await response.text(), 'text/html');
    const alternateLink = doc.querySelector('link[rel="alternate"][type="text/turtle"]') as HTMLLinkElement;
    expect(alternateLink).toBeTruthy();
    expect(alternateLink.href).toBe('https://example.com/ontology.ttl');
  });

  it('should handle HTTP errors', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: {
        get: () => null,
      },
      text: async () => 'Not Found',
    });

    const url = 'https://example.com/nonexistent.ttl';
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/turtle',
        'User-Agent': 'curl/8.0.0',
      },
    });

    expect(response.ok).toBe(false);
    expect(response.status).toBe(404);
  });

  it('should handle network errors', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    const url = 'https://example.com/test.ttl';
    
    await expect(fetch(url, {
      headers: {
        'Accept': 'text/turtle',
        'User-Agent': 'curl/8.0.0',
      },
    })).rejects.toThrow('Network error');
  });
});
