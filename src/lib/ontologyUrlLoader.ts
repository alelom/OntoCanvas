/**
 * Fetches an ontology from a URL, handling content negotiation and HTML fallbacks.
 * 
 * This function reuses fetchExternalOntologyTtl to ensure consistency and avoid code duplication.
 * The fetchExternalOntologyTtl function already has all the proper redirect handling, content
 * negotiation, and fallback logic that works correctly.
 * 
 * @param url - The URL to fetch the ontology from
 * @returns The Turtle content as a string
 * @throws Error if the ontology cannot be fetched
 */
export async function fetchOntologyFromUrl(url: string): Promise<string> {
  // Import fetchExternalOntologyTtl dynamically to avoid circular dependencies
  const { fetchExternalOntologyTtl } = await import('../externalOntologySearch');
  const ttl = await fetchExternalOntologyTtl(url, { throwOnCors: true });
  if (!ttl) {
    throw new Error(`Failed to fetch ontology from ${url}`);
  }
  return ttl;
}
