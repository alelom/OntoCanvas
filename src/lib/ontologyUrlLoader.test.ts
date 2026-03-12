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

    it('converts .html URLs to .ttl equivalents (from convertOntologyUrlToHtmlUrl)', () => {
      const url = 'https://burohappoldmachinelearning.github.io/ADIRO/aec_drawing_metadata.html';
      const candidates = getOntologyUrlCandidates(url);
      expect(candidates).toContain('https://burohappoldmachinelearning.github.io/ADIRO/aec_drawing_metadata.html');
      expect(candidates).toContain('https://burohappoldmachinelearning.github.io/ADIRO/aec_drawing_metadata.ttl');
      expect(candidates).toContain('https://burohappoldmachinelearning.github.io/ADIRO/aec-drawing-metadata.ttl');
      expect(candidates).toContain('https://burohappoldmachinelearning.github.io/ADIRO/aec_drawing_metadata');
      expect(candidates).toContain('https://burohappoldmachinelearning.github.io/ADIRO/aec-drawing-metadata');
      expect(candidates.length).toBeGreaterThanOrEqual(5);
    });

    it('does not append /ontology.ttl to .html URLs', () => {
      const url = 'https://example.com/ontology.html';
      const candidates = getOntologyUrlCandidates(url);
      // Should not contain .../ontology.html/ontology.ttl
      expect(candidates.some(c => c.includes('.html/ontology.ttl'))).toBe(false);
      // Should contain .ttl variants
      expect(candidates.some(c => c.endsWith('.ttl'))).toBe(true);
    });

    it('handles .html URLs without underscores (just adds .ttl)', () => {
      const url = 'https://example.com/ontology.html';
      const candidates = getOntologyUrlCandidates(url);
      expect(candidates).toContain('https://example.com/ontology.html');
      expect(candidates).toContain('https://example.com/ontology.ttl');
      expect(candidates).toContain('https://example.com/ontology');
      // Should not have hyphen variant since there are no underscores
      expect(candidates.filter(c => c.includes('ontolog-'))).toHaveLength(0);
    });

    it('handles .html URLs with multiple underscores', () => {
      const url = 'https://example.com/my_ontology_name_here.html';
      const candidates = getOntologyUrlCandidates(url);
      expect(candidates).toContain('https://example.com/my_ontology_name_here.html');
      expect(candidates).toContain('https://example.com/my_ontology_name_here.ttl');
      expect(candidates).toContain('https://example.com/my-ontology-name-here.ttl');
      expect(candidates).toContain('https://example.com/my_ontology_name_here');
      expect(candidates).toContain('https://example.com/my-ontology-name-here');
    });

    it('handles .html URLs with trailing hash', () => {
      const url = 'https://example.com/ontology.html#';
      const candidates = getOntologyUrlCandidates(url);
      // Hash should be stripped
      expect(candidates.every(c => !c.endsWith('#'))).toBe(true);
      expect(candidates).toContain('https://example.com/ontology.html');
      expect(candidates).toContain('https://example.com/ontology.ttl');
    });

    it('handles .html URLs in subdirectories', () => {
      const url = 'https://example.com/path/to/ontology_name.html';
      const candidates = getOntologyUrlCandidates(url);
      expect(candidates).toContain('https://example.com/path/to/ontology_name.html');
      expect(candidates).toContain('https://example.com/path/to/ontology_name.ttl');
      expect(candidates).toContain('https://example.com/path/to/ontology-name.ttl');
    });

    it('handles mixed case .HTML extension', () => {
      const url = 'https://example.com/ontology.HTML';
      const candidates = getOntologyUrlCandidates(url);
      expect(candidates).toContain('https://example.com/ontology.HTML');
      expect(candidates).toContain('https://example.com/ontology.ttl');
      expect(candidates).toContain('https://example.com/ontology');
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

    it('tries multiple candidates for .html URLs (regression test)', async () => {
      const { fetchExternalOntologyTtl } = await import('../externalOntologySearch');
      // Simulate that the .html URL fails, but the .ttl variant succeeds
      vi.mocked(fetchExternalOntologyTtl)
        .mockResolvedValueOnce(null) // .html URL fails
        .mockResolvedValueOnce('@prefix : <#> .'); // .ttl with underscores succeeds

      const htmlUrl = 'https://burohappoldmachinelearning.github.io/ADIRO/aec_drawing_metadata.html';
      const result = await fetchOntologyFromUrl(htmlUrl);
      
      expect(result).toBe('@prefix : <#> .');
      // Should have tried multiple candidates
      expect(fetchExternalOntologyTtl).toHaveBeenCalledTimes(2);
      // Should have tried the .ttl variant
      expect(fetchExternalOntologyTtl).toHaveBeenCalledWith(
        'https://burohappoldmachinelearning.github.io/ADIRO/aec_drawing_metadata.ttl',
        { throwOnCors: true }
      );
    });

    it('tries hyphen variant when underscore variant fails for .html URLs', async () => {
      const { fetchExternalOntologyTtl } = await import('../externalOntologySearch');
      // Simulate that underscore variant fails, but hyphen variant succeeds
      vi.mocked(fetchExternalOntologyTtl)
        .mockResolvedValueOnce(null) // .html URL fails
        .mockResolvedValueOnce(null) // .ttl with underscores fails
        .mockResolvedValueOnce('@prefix : <#> .'); // .ttl with hyphens succeeds

      const htmlUrl = 'https://burohappoldmachinelearning.github.io/ADIRO/aec_drawing_metadata.html';
      const result = await fetchOntologyFromUrl(htmlUrl);
      
      expect(result).toBe('@prefix : <#> .');
      // Should have tried multiple candidates including hyphen variant
      expect(fetchExternalOntologyTtl).toHaveBeenCalledTimes(3);
      expect(fetchExternalOntologyTtl).toHaveBeenCalledWith(
        'https://burohappoldmachinelearning.github.io/ADIRO/aec-drawing-metadata.ttl',
        { throwOnCors: true }
      );
    });

    it('does not try invalid .html/ontology.ttl path (regression test)', async () => {
      const { fetchExternalOntologyTtl } = await import('../externalOntologySearch');
      vi.mocked(fetchExternalOntologyTtl).mockResolvedValue(null);

      const htmlUrl = 'https://example.com/ontology.html';
      
      // Should throw after trying all valid candidates
      await expect(fetchOntologyFromUrl(htmlUrl)).rejects.toThrow(/Failed to fetch ontology/);
      
      // Verify that we never tried the invalid path
      const calls = vi.mocked(fetchExternalOntologyTtl).mock.calls;
      const invalidPaths = calls.filter(call => call[0].includes('.html/ontology.ttl'));
      expect(invalidPaths.length).toBe(0);
      
      // But we should have tried valid candidates
      expect(calls.length).toBeGreaterThan(0);
    });
  });
});
