const RDF_EXTENSIONS = /\.(ttl|owl|rdf|rdfxml|n3|jsonld)$/i;
const HTML_EXTENSION = /\.html$/i;

/**
 * Returns candidate URLs to try when loading an ontology. When the URL looks like a
 * directory (ends with / or has no RDF file extension), adds a fallback with ontology.ttl
 * so that e.g. https://example.org/repo/latest/ is tried as .../latest/ontology.ttl.
 * 
 * For .html URLs (from convertOntologyUrlToHtmlUrl), converts back to .ttl format
 * by replacing .html with .ttl and optionally converting underscores back to hyphens.
 * 
 * Used by fetchOntologyFromUrl and by tests.
 */
export function getOntologyUrlCandidates(url: string): string[] {
  const normalized = url.trim().replace(/#$/, '');
  const candidates: string[] = [normalized];
  try {
    const u = new URL(normalized);
    const pathname = u.pathname;
    const endsWithSlash = pathname.endsWith('/');
    const lastSegment = pathname.split('/').filter(Boolean).pop() ?? '';
    const hasRdfExtension = RDF_EXTENSIONS.test(lastSegment);
    const hasHtmlExtension = HTML_EXTENSION.test(lastSegment);
    
    if (hasHtmlExtension) {
      // Handle .html URLs (from convertOntologyUrlToHtmlUrl)
      // Convert back to .ttl: replace .html with .ttl, and optionally convert underscores to hyphens
      const baseUrl = normalized.replace(/\.html$/i, '');
      // Try with .ttl extension (keeping underscores as-is)
      candidates.push(`${baseUrl}.ttl`);
      // Also try converting underscores back to hyphens (reverse of convertOntologyUrlToHtmlUrl)
      const withHyphens = baseUrl.replace(/_/g, '-');
      if (withHyphens !== baseUrl) {
        candidates.push(`${withHyphens}.ttl`);
      }
      // Also try the base URL without extension (for content negotiation)
      candidates.push(baseUrl);
      if (withHyphens !== baseUrl) {
        candidates.push(withHyphens);
      }
    } else if (endsWithSlash || !hasRdfExtension) {
      // Original logic: directory or no RDF extension
      const base = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
      candidates.push(`${base}/ontology.ttl`);
    }
  } catch {
    // Invalid URL: only try the normalized string as-is
  }
  return candidates;
}

/**
 * Fetches an ontology from a URL, handling content negotiation and HTML fallbacks.
 * When the URL looks like a directory (e.g. .../latest/), also tries .../ontology.ttl.
 *
 * Reuses fetchExternalOntologyTtl for consistency (redirects, content negotiation, etc.).
 *
 * @param url - The URL to fetch the ontology from
 * @returns The Turtle content as a string
 * @throws Error if the ontology cannot be fetched from any candidate URL
 */
export async function fetchOntologyFromUrl(url: string): Promise<string> {
  const { fetchExternalOntologyTtl } = await import('../externalOntologySearch');
  const candidates = getOntologyUrlCandidates(url);
  let lastError: Error | null = null;
  for (const candidate of candidates) {
    try {
      const ttl = await fetchExternalOntologyTtl(candidate, { throwOnCors: true });
      if (ttl && ttl.trim()) {
        return ttl;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error(`Failed to fetch ontology from ${url}`);
}
