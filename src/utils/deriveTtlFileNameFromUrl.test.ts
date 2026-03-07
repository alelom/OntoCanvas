import { describe, it, expect } from 'vitest';
import { deriveTtlFileNameFromUrl } from './deriveTtlFileNameFromUrl';

describe('deriveTtlFileNameFromUrl', () => {
  it('uses last path segment with .ttl extension when URL ends with ontology.ttl', () => {
    expect(deriveTtlFileNameFromUrl('https://pi.pauwel.be/voc/buildingelement/ontology.ttl')).toBe(
      'ontology.ttl'
    );
  });

  it('uses last path segment as base and adds .ttl when URL has no extension', () => {
    expect(deriveTtlFileNameFromUrl('https://pi.pauwel.be/voc/buildingelement')).toBe(
      'buildingelement.ttl'
    );
  });

  it('strips existing non-ttl extension and adds .ttl', () => {
    expect(deriveTtlFileNameFromUrl('https://example.com/ontology.owl')).toBe('ontology.ttl');
  });

  it('handles trailing slash', () => {
    expect(deriveTtlFileNameFromUrl('https://example.com/voc/')).toBe('voc.ttl');
  });

  it('returns ontology.ttl for empty or invalid URL', () => {
    expect(deriveTtlFileNameFromUrl('')).toBe('ontology.ttl');
  });

  it('sanitizes segment to safe filename', () => {
    expect(deriveTtlFileNameFromUrl('https://example.com/foo-bar_baz.owl')).toBe('foo-bar_baz.ttl');
  });

  it('falls back to ontology.ttl when segment would be unsafe', () => {
    // Segment with slashes or invalid chars gets replaced
    expect(deriveTtlFileNameFromUrl('https://example.com/')).toBe('ontology.ttl');
  });
});
