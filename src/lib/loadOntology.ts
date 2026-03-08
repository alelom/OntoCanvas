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

/** Known RDF path extensions used by rdf-parse for format detection. */
const RDF_EXTENSION_REGEX = /\.(ttl|turtle|owl|rdf|rdfxml|jsonld|json|nt|nq|n3|trig)$/i;

function pathHasRdfExtension(path: string): boolean {
  return RDF_EXTENSION_REGEX.test(path);
}

/**
 * Infer MIME type from content when path has no extension (e.g. URL ending in /).
 * Used to avoid rdf-parse error "No valid extension could be detected from the given 'path' option".
 */
function inferContentTypeFromContent(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith('@prefix') || trimmed.startsWith('@base')) return 'text/turtle';
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<rdf')) return 'application/rdf+xml';
  if (trimmed.startsWith('{')) return 'application/ld+json';
  return 'text/turtle';
}

/**
 * Parse RDF content and extract prefix map and external refs.
 * Use pathHint (URL or filename) and optional contentType for format detection.
 * When pathHint has no RDF extension (e.g. URL ending in /), content-type is inferred from content.
 */
export async function loadOntologyFromContent(
  content: string,
  pathHint: string,
  options?: { contentType?: string }
): Promise<LoadOntologyResult> {
  const contentType =
    options?.contentType ??
    (pathHasRdfExtension(pathHint) ? undefined : inferContentTypeFromContent(content));
  const parseResult = await parseRdfToGraph(content, {
    path: pathHint,
    contentType,
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
