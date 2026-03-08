/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOntologyUrlCandidates, fetchOntologyFromUrl } from './ontologyUrlLoader';

vi.mock('../externalOntologySearch', () => ({
  fetchExternalOntologyTtl: vi.fn(),
}));

describe('ontologyUrlLoader', () => {
  describe('getOntologyUrlCandidates', () => {
    it('returns only the URL when it has an RDF extension', () => {
      expect(getOntologyUrlCandidates('https://example.com/ontology.ttl')).toEqual([
        'https://example.com/ontology.ttl',
      ]);
      expect(getOntologyUrlCandidates('https://example.com/foo.owl')).toEqual([
        'https://example.com/foo.owl',
      ]);
      expect(getOntologyUrlCandidates('https://example.com/bar.rdf')).toEqual([
        'https://example.com/bar.rdf',
      ]);
    });

    it('adds ontology.ttl fallback when URL ends with slash (directory-style)', () => {
      expect(getOntologyUrlCandidates('https://example.com/repo/latest/')).toEqual([
        'https://example.com/repo/latest/',
        'https://example.com/repo/latest/ontology.ttl',
      ]);
    });

    it('adds ontology.ttl fallback when last path segment has no RDF extension', () => {
      expect(getOntologyUrlCandidates('https://example.com/repo/latest')).toEqual([
        'https://example.com/repo/latest',
        'https://example.com/repo/latest/ontology.ttl',
      ]);
    });

    it('Digital Construction Processes URL: adds ontology.ttl so load succeeds', () => {
      const url = 'https://digitalconstruction.github.io/Processes/latest/';
      const candidates = getOntologyUrlCandidates(url);
      expect(candidates).toHaveLength(2);
      expect(candidates[0]).toBe(url);
      expect(candidates[1]).toBe('https://digitalconstruction.github.io/Processes/latest/ontology.ttl');
    });

    it('strips trailing hash from URL', () => {
      expect(getOntologyUrlCandidates('https://example.com/ont#')).toEqual([
        'https://example.com/ont',
        'https://example.com/ont/ontology.ttl',
      ]);
    });

    it('invalid URL returns only normalized string', () => {
      const candidates = getOntologyUrlCandidates('not-a-url');
      expect(candidates).toEqual(['not-a-url']);
    });
  });

  describe('fetchOntologyFromUrl', () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      const { fetchExternalOntologyTtl } = await import('../externalOntologySearch');
      vi.mocked(fetchExternalOntologyTtl).mockReset();
    });

    it('returns TTL from first candidate when it succeeds', async () => {
      const { fetchExternalOntologyTtl } = await import('../externalOntologySearch');
      vi.mocked(fetchExternalOntologyTtl).mockResolvedValue('@prefix : <#> .');

      const result = await fetchOntologyFromUrl('https://example.com/ontology.ttl');
      expect(result).toBe('@prefix : <#> .');
      expect(fetchExternalOntologyTtl).toHaveBeenCalledTimes(1);
      expect(fetchExternalOntologyTtl).toHaveBeenCalledWith(
        'https://example.com/ontology.ttl',
        { throwOnCors: true }
      );
    });

    it('tries ontology.ttl fallback when first candidate fails', async () => {
      const { fetchExternalOntologyTtl } = await import('../externalOntologySearch');
      vi.mocked(fetchExternalOntologyTtl)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('@prefix : <#> .');

      const result = await fetchOntologyFromUrl('https://digitalconstruction.github.io/Processes/latest/');
      expect(result).toBe('@prefix : <#> .');
      expect(fetchExternalOntologyTtl).toHaveBeenCalledTimes(2);
      expect(fetchExternalOntologyTtl).toHaveBeenNthCalledWith(
        1,
        'https://digitalconstruction.github.io/Processes/latest/',
        { throwOnCors: true }
      );
      expect(fetchExternalOntologyTtl).toHaveBeenNthCalledWith(
        2,
        'https://digitalconstruction.github.io/Processes/latest/ontology.ttl',
        { throwOnCors: true }
      );
    });

    it('throws when all candidates fail', async () => {
      const { fetchExternalOntologyTtl } = await import('../externalOntologySearch');
      vi.mocked(fetchExternalOntologyTtl).mockResolvedValue(null);

      await expect(
        fetchOntologyFromUrl('https://example.com/repo/latest/')
      ).rejects.toThrow(/Failed to fetch ontology/);
      expect(fetchExternalOntologyTtl).toHaveBeenCalledTimes(2);
    });
  });
});
