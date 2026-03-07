/**
 * Load ontology from RDF content (any supported format).
 * Parses content, extracts prefix map and external refs; caller applies state and UI.
 */
import { parseRdfToGraph } from '../parser';
import type { ParseResult } from '../parser';
import { extractExternalRefsFromStore, extractPrefixesFromTtl } from '../ui/externalRefs';
import type { ExternalOntologyReference } from '../storage';

export interface LoadOntologyResult {
  parseResult: ParseResult;
  prefixMap: Record<string, string>;
  extractedRefs: ExternalOntologyReference[];
}

/**
 * Whether the content looks like Turtle (has @prefix or @base).
 */
function looksLikeTurtle(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith('@prefix') || trimmed.startsWith('@base');
}

/**
 * Parse RDF content and extract prefix map and external refs.
 * Use pathHint (URL or filename) and optional contentType for format detection.
 */
export async function loadOntologyFromContent(
  content: string,
  pathHint: string,
  options?: { contentType?: string }
): Promise<LoadOntologyResult> {
  const parseResult = await parseRdfToGraph(content, {
    path: pathHint,
    contentType: options?.contentType,
  });

  const prefixMap = looksLikeTurtle(content) ? extractPrefixesFromTtl(content) : {};
  const extractedRefs = extractExternalRefsFromStore(parseResult.store);

  // Enhance extracted refs with prefixes from source (Turtle only has @prefix)
  for (const ref of extractedRefs) {
    const urlWithoutHash = ref.url.endsWith('#') ? ref.url.slice(0, -1) : ref.url;
    for (const [prefix, url] of Object.entries(prefixMap)) {
      const urlStr = String(url);
      const prefixUrlWithoutHash = urlStr.endsWith('#') ? urlStr.slice(0, -1) : urlStr;
      if (urlWithoutHash === prefixUrlWithoutHash) {
        ref.prefix = prefix;
        ref.usePrefix = true;
        break;
      }
    }
  }

  return { parseResult, prefixMap, extractedRefs };
}
