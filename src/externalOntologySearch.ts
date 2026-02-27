import { Parser, Store } from 'n3';
import { extractLocalName, extractLocalNameFromUri } from './parser';

export interface ExternalClassInfo {
  uri: string;
  localName: string;
  label: string;
  comment?: string;
  ontologyUrl: string;
  prefix?: string;
}

export interface ExternalObjectPropertyInfo {
  uri: string;
  localName: string;
  label: string;
  comment?: string;
  ontologyUrl: string;
  prefix?: string;
  hasCardinality?: boolean; // Default to true if not specified
}

export interface ExternalOntologyReference {
  url: string;
  usePrefix: boolean;
  prefix?: string;
}

/**
 * Centralized cache for raw TTL content from external ontologies.
 * This ensures we fetch the TTL once and reuse it for both classes and object properties.
 */
const externalTtlCache: Map<string, string> = new Map();

/**
 * Fetches and parses an external ontology to extract OWL classes.
 * Results are cached per URL to avoid redundant fetches.
 */
const externalClassesCache: Map<string, ExternalClassInfo[]> = new Map();

/**
 * Fetches and parses an external ontology to extract OWL object properties.
 * Results are cached per URL to avoid redundant fetches.
 */
const externalObjectPropertiesCache: Map<string, ExternalObjectPropertyInfo[]> = new Map();

/**
 * Fetches and caches the raw TTL content from an external ontology.
 * This is the central function that ensures we fetch TTL once and reuse it.
 * Returns the TTL text, or null if fetching failed.
 */
export async function fetchExternalOntologyTtl(
  url: string
): Promise<string | null> {
  // Normalize URL (remove trailing # if present)
  const normalizedUrl = url.endsWith('#') ? url.slice(0, -1) : url;
  
  // Check cache first
  if (externalTtlCache.has(normalizedUrl)) {
    console.log(`Using cached TTL for ${normalizedUrl}`);
    return externalTtlCache.get(normalizedUrl)!;
  }

  try {
    console.log(`Fetching external ontology TTL from: ${normalizedUrl}`);
    
    // Use HTTP content negotiation - match curl format exactly
    // Override User-Agent to avoid server serving HTML to browsers
    // Add timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      console.error(`Fetch timeout after 2s for ${normalizedUrl}`);
    }, 2000); // 2 second timeout
    
    let response;
    try {
      response = await fetch(normalizedUrl, {
        method: 'GET',
        headers: {
          'Accept': 'text/turtle',
          'User-Agent': 'curl/8.0.0', // Override browser User-Agent to get Turtle instead of HTML
        },
        redirect: 'follow', // Explicitly follow redirects (like curl -L)
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
        console.error(`Fetch aborted (timeout) for ${normalizedUrl}`);
        // If initial fetch times out, try known fallback URLs directly
        // This handles cases where the redirect is slow but the final URL works
        console.warn(`Initial fetch timed out, trying fallback URLs directly...`);
        response = undefined; // Mark that we need to try fallbacks
      } else {
        throw fetchErr;
      }
    }
    
    // If we got a response, process it normally
    if (response) {
      if (!response.ok) {
        console.error(`Failed to fetch ${normalizedUrl}: HTTP ${response.status} ${response.statusText}`);
        return null;
      }
      
      const contentType = response.headers.get('content-type') || '';
      const finalUrl = response.url; // Get final URL after redirects
      console.log(`Fetched ${response.status} from ${normalizedUrl}, final URL: ${finalUrl}, content-type: ${contentType}`);
      
      let text = await response.text();
      console.log(`Fetched ${text.length} characters, content-type: ${contentType}`);
      
      if (!text.trim()) {
        console.warn(`Empty response from ${normalizedUrl}`);
        return null;
      }
      
      // Check if we got RDF/Turtle content (content negotiation succeeded)
      const isRdfContent = contentType.includes('text/turtle') ||
                           contentType.includes('application/rdf+xml') ||
                           contentType.includes('application/n-triples') ||
                           contentType.includes('text/n3') ||
                           text.trim().startsWith('@prefix') ||
                           text.trim().startsWith('@base') ||
                           (text.trim().startsWith('<') && !text.trim().toLowerCase().startsWith('<!doctype'));
      
      // Check if response is HTML instead of RDF/Turtle (content negotiation failed)
      const isHtml = contentType.includes('text/html') || 
                     text.trim().toLowerCase().startsWith('<!doctype') ||
                     text.trim().toLowerCase().startsWith('<html');
      
      if (isRdfContent) {
        // Content negotiation succeeded - cache and return the TTL text
        externalTtlCache.set(normalizedUrl, text);
        return text;
      }
      
      if (isHtml) {
        // Content negotiation failed - server returned HTML despite Accept: text/turtle
        // This often happens when servers check User-Agent and serve HTML to browsers
        // Try to extract the actual Turtle URL from HTML alternate links
        console.warn(`Content negotiation failed for ${normalizedUrl}: received HTML instead of RDF/Turtle.`);
        console.warn(`  Attempting to extract Turtle link from HTML...`);
        
        // Look for alternate links in HTML (common pattern: <link rel="alternate" type="text/turtle" href="...">)
        const linkPatterns = [
          /<link[^>]+rel=["']alternate["'][^>]+type=["']text\/turtle["'][^>]+href=["']([^"']+)["']/i,
          /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']alternate["'][^>]+type=["']text\/turtle["']/i,
          /<link[^>]+type=["']text\/turtle["'][^>]+href=["']([^"']+)["']/i,
        ];
        
        for (const pattern of linkPatterns) {
          const match = text.match(pattern);
          if (match && match[1]) {
            const turtleUrl = new URL(match[1], normalizedUrl).href;
            console.log(`Found alternate Turtle link in HTML: ${turtleUrl}`);
            
            // Fetch the actual Turtle content from the alternate link
            try {
              const altController = new AbortController();
              const altTimeoutId = setTimeout(() => altController.abort(), 2000);
              let turtleResponse;
              try {
                turtleResponse = await fetch(turtleUrl, {
                  method: 'GET',
                  headers: {
                    'Accept': 'text/turtle',
                    'User-Agent': 'curl/8.0.0',
                  },
                  redirect: 'follow',
                  signal: altController.signal,
                });
                clearTimeout(altTimeoutId);
              } catch (altFetchErr) {
                clearTimeout(altTimeoutId);
                if (altFetchErr instanceof Error && altFetchErr.name === 'AbortError') {
                  throw new Error(`Request timeout: Failed to fetch ${turtleUrl} within 2 seconds`);
                }
                throw altFetchErr;
              }
              
              if (turtleResponse.ok) {
                text = await turtleResponse.text();
                const turtleContentType = turtleResponse.headers.get('content-type') || '';
                console.log(`Successfully fetched Turtle from alternate link: ${turtleUrl}, content-type: ${turtleContentType}`);
                
                if (text.trim() && !text.trim().toLowerCase().startsWith('<!doctype')) {
                  // Cache and return the TTL text
                  externalTtlCache.set(normalizedUrl, text);
                  return text;
                }
              }
            } catch (altErr) {
              console.warn(`Failed to fetch from alternate link ${turtleUrl}:`, altErr);
            }
          }
        }
        
        // If HTML alternate links didn't work, try constructing the direct Turtle URL
        // For w3id.org/dano, the server redirects to github.io/dano/ which serves HTML to browsers
        // But the Turtle file is at github.io/dano/dano.ttl
        console.warn(`Alternate links not found in HTML. Trying direct Turtle URL construction...`);
        
        const urlObj = new URL(finalUrl);
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        const turtleUrlPatterns: string[] = [];
        
        // First, try replacing .html with common RDF extensions (most common pattern for HTML ontology pages)
        // This works for any URL, not just GitHub Pages
        const lastPart = pathParts[pathParts.length - 1] || '';
        if (finalUrl.endsWith('.html') || lastPart.endsWith('.html')) {
          const baseUrl = finalUrl.replace(/\.html$/i, '');
          turtleUrlPatterns.push(
            `${baseUrl}.ttl`,
            `${baseUrl}.owl`,
            `${baseUrl}.rdf`
          );
        }
        
        // Try directory-based patterns (remove filename, try common ontology filenames)
        if (pathParts.length > 0) {
          const dirPath = pathParts.slice(0, -1); // Remove last part (filename)
          const baseDir = dirPath.length > 0 ? `/${dirPath.join('/')}` : '';
          const commonNames = ['ontology.ttl', 'index.ttl', 'ontology.owl', 'index.owl'];
          for (const name of commonNames) {
            turtleUrlPatterns.push(`${urlObj.origin}${baseDir}/${name}`);
          }
        }
        
        // Check if the final URL is from GitHub Pages (common pattern for ontology hosting)
        if (finalUrl.includes('github.io') || finalUrl.includes('github.com')) {
          // Try GitHub Pages specific patterns
          if (pathParts.length > 0) {
            turtleUrlPatterns.push(
              `${urlObj.origin}/${pathParts[0]}/dano.ttl`, // e.g., github.io/dano/dano.ttl
              `${urlObj.origin}/dano.ttl`, // e.g., github.io/dano.ttl
              `${urlObj.origin}/${pathParts.join('/')}/dano.ttl` // Append to existing path
            );
            
            // Try with the actual directory name instead of hardcoded "dano"
            const dirName = pathParts[0];
            if (dirName) {
              turtleUrlPatterns.push(
                `${urlObj.origin}/${dirName}/${dirName}.ttl`,
                `${urlObj.origin}/${dirName}/ontology.ttl`
              );
            }
          }
          
          // Also try based on the original normalized URL
          if (normalizedUrl.includes('w3id.org/dano')) {
            turtleUrlPatterns.unshift('https://rub-informatik-im-bauwesen.github.io/dano/dano.ttl');
          }
        }
        
        // Try all constructed Turtle URL patterns
        for (const turtleUrl of turtleUrlPatterns) {
            try {
              console.log(`Trying direct Turtle URL: ${turtleUrl}`);
              const directController = new AbortController();
              const directTimeoutId = setTimeout(() => directController.abort(), 2000);
              let turtleResponse;
              try {
                turtleResponse = await fetch(turtleUrl, {
                  method: 'GET',
                  headers: {
                    'Accept': 'text/turtle',
                    'User-Agent': 'curl/8.0.0',
                  },
                  redirect: 'follow',
                  signal: directController.signal,
                });
                clearTimeout(directTimeoutId);
              } catch (directFetchErr) {
                clearTimeout(directTimeoutId);
                if (directFetchErr instanceof Error && directFetchErr.name === 'AbortError') {
                  throw new Error(`Request timeout: Failed to fetch ${turtleUrl} within 2 seconds`);
                }
                throw directFetchErr;
              }
              
              if (turtleResponse.ok || turtleResponse.status === 200) {
                text = await turtleResponse.text();
                const turtleContentType = turtleResponse.headers.get('content-type') || '';
                
                // More robust HTML detection
                const looksLikeHtml = text.trim().toLowerCase().startsWith('<!doctype') ||
                                     text.trim().toLowerCase().startsWith('<html') ||
                                     (text.includes('<html') && text.includes('</html>'));
                
                if (text.trim() && !looksLikeHtml) {
                  // Check if it looks like RDF/Turtle
                  const looksLikeRdf = text.trim().startsWith('@prefix') ||
                                       text.trim().startsWith('@base') ||
                                       text.includes('rdf:type') ||
                                       text.includes('owl:') ||
                                       text.includes('rdfs:');
                  
                  if (looksLikeRdf) {
                    console.log(`Successfully fetched Turtle from direct URL: ${turtleUrl}, content-type: ${turtleContentType}`);
                    // Cache and return the TTL text
                    externalTtlCache.set(normalizedUrl, text);
                    return text;
                  }
                }
              }
            } catch (directErr) {
              // Continue to next pattern
              console.warn(`Failed to fetch from direct URL ${turtleUrl}:`, directErr);
            }
          }
        
        console.error(`Could not find or fetch Turtle content from ${normalizedUrl}`);
        console.error(`  Final URL: ${finalUrl}`);
        console.error(`  Content-Type: ${contentType}`);
        return null;
      }
      
      // If we get here, we have content but it's not clearly RDF or HTML
      // Try to parse it anyway (might be RDF without proper content-type header)
      console.warn(`Unclear content type from ${normalizedUrl}, assuming it's Turtle`);
      // Cache and return the text anyway
      externalTtlCache.set(normalizedUrl, text);
      return text;
    }
    
    // If we get here, either:
    // 1. Initial fetch timed out (response is undefined)
    // 2. We need to try known fallback URLs
    // Try known fallback URLs directly
    console.warn(`Trying known fallback URLs directly...`);
    
    // Known URL patterns that work when the initial fetch times out
    const knownFallbacks: Array<{ pattern: string | RegExp; turtleUrl: string }> = [
      {
        pattern: /w3id\.org\/dano/,
        turtleUrl: 'https://rub-informatik-im-bauwesen.github.io/dano/dano.ttl'
      }
    ];
    
    for (const fallback of knownFallbacks) {
      if (typeof fallback.pattern === 'string' ? normalizedUrl.includes(fallback.pattern) : fallback.pattern.test(normalizedUrl)) {
        console.log(`Trying known fallback URL: ${fallback.turtleUrl}`);
        try {
          const fallbackController = new AbortController();
          const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), 2000);
          let fallbackResponse;
          try {
            fallbackResponse = await fetch(fallback.turtleUrl, {
              method: 'GET',
              headers: {
                'Accept': 'text/turtle',
                'User-Agent': 'curl/8.0.0',
              },
              redirect: 'follow',
              signal: fallbackController.signal,
            });
            clearTimeout(fallbackTimeoutId);
          } catch (fallbackFetchErr) {
            clearTimeout(fallbackTimeoutId);
            if (fallbackFetchErr instanceof Error && fallbackFetchErr.name === 'AbortError') {
              console.warn(`Fallback URL timed out: ${fallback.turtleUrl}`);
              continue; // Try next fallback
            }
            throw fallbackFetchErr;
          }
          
          if (fallbackResponse.ok) {
            const fallbackText = await fallbackResponse.text();
            const fallbackContentType = fallbackResponse.headers.get('content-type') || '';
            
            if (fallbackText.trim() && !fallbackText.trim().toLowerCase().startsWith('<!doctype')) {
              console.log(`Successfully fetched Turtle from fallback URL: ${fallback.turtleUrl}, content-type: ${fallbackContentType}`);
              // Cache and return the TTL text
              externalTtlCache.set(normalizedUrl, fallbackText);
              return fallbackText;
            }
          }
        } catch (fallbackErr) {
          console.warn(`Failed to fetch from fallback URL ${fallback.turtleUrl}:`, fallbackErr);
        }
      }
    }
    
    // If all fallbacks failed, return null
    console.error(`Failed to fetch TTL from ${normalizedUrl} and all fallback URLs`);
    return null;
  } catch (err) {
    console.error(`Failed to fetch TTL from ${normalizedUrl}:`, err);
    return null;
  }
}

async function parseOntologyContent(
  text: string,
  normalizedUrl: string,
  externalRefs?: ExternalOntologyReference[]
): Promise<ExternalClassInfo[]> {
  try {
    const parser = new Parser({ format: 'text/turtle' });
    const quads = parser.parse(text);
    const store = new Store(quads);
    
    const classes: ExternalClassInfo[] = [];
    const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
    const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
    const OWL = 'http://www.w3.org/2002/07/owl#';
    
    const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
    const seen = new Set<string>();
    
    for (const q of classQuads) {
      const subj = q.subject as { termType: string; value?: string };
      if (subj.termType !== 'NamedNode') continue;
      const uri = subj.value!;
      if (seen.has(uri)) continue;
      seen.add(uri);
      
      const localName = extractLocalNameFromUri(uri);
      const labelQuads = store.getQuads(subj as any, RDFS + 'label', null, null);
      const labelQuad = labelQuads[0];
      const label = labelQuad?.object && (labelQuad.object as { value?: string }).value 
        ? String((labelQuad.object as { value: string }).value) 
        : localName;
      const commentQuads = store.getQuads(subj as any, RDFS + 'comment', null, null);
      const commentQuad = commentQuads[0];
      const comment = commentQuad?.object && (commentQuad.object as { value?: string }).value
        ? String((commentQuad.object as { value: string }).value)
        : undefined;
      
      const ref = externalRefs?.find((r) => {
        const refUrl = r.url.endsWith('#') ? r.url.slice(0, -1) : r.url;
        return refUrl === normalizedUrl;
      });
      classes.push({
        uri,
        localName,
        label,
        comment,
        ontologyUrl: normalizedUrl,
        prefix: ref?.prefix,
      });
    }
    
    console.log(`Extracted ${classes.length} classes from ${normalizedUrl}`);
    externalClassesCache.set(normalizedUrl, classes);
    return classes;
  } catch (err) {
    console.error(`Failed to parse ontology content from ${normalizedUrl}:`, err);
    return [];
  }
}

async function parseOntologyObjectProperties(
  text: string,
  normalizedUrl: string,
  externalRefs?: ExternalOntologyReference[]
): Promise<ExternalObjectPropertyInfo[]> {
  try {
    const parser = new Parser({ format: 'text/turtle' });
    const quads = parser.parse(text);
    const store = new Store(quads);
    
    const objectProperties: ExternalObjectPropertyInfo[] = [];
    const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
    const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
    const OWL = 'http://www.w3.org/2002/07/owl#';
    
    const opQuads = store.getQuads(null, RDF + 'type', OWL + 'ObjectProperty', null);
    const seen = new Set<string>();
    
    for (const q of opQuads) {
      const subj = q.subject as { termType: string; value?: string };
      if (subj.termType !== 'NamedNode') continue;
      const uri = subj.value!;
      if (seen.has(uri)) continue;
      seen.add(uri);
      
      const localName = extractLocalNameFromUri(uri);
      const labelQuads = store.getQuads(subj as any, RDFS + 'label', null, null);
      const labelQuad = labelQuads[0];
      const label = labelQuad?.object && (labelQuad.object as { value?: string }).value 
        ? String((labelQuad.object as { value: string }).value) 
        : localName;
      const commentQuads = store.getQuads(subj as any, RDFS + 'comment', null, null);
      const commentQuad = commentQuads[0];
      const comment = commentQuad?.object && (commentQuad.object as { value?: string }).value
        ? String((commentQuad.object as { value: string }).value)
        : undefined;
      
      const ref = externalRefs?.find((r) => {
        const refUrl = r.url.endsWith('#') ? r.url.slice(0, -1) : r.url;
        return refUrl === normalizedUrl;
      });
      
      // Default hasCardinality to true (most object properties support cardinality)
      objectProperties.push({
        uri,
        localName,
        label,
        comment,
        ontologyUrl: normalizedUrl,
        prefix: ref?.prefix,
        hasCardinality: true,
      });
    }
    
    console.log(`Extracted ${objectProperties.length} object properties from ${normalizedUrl}`);
    return objectProperties;
  } catch (err) {
    console.error(`Failed to parse object properties from ${normalizedUrl}:`, err);
    return [];
  }
}

/**
 * Fetches and parses an external ontology to extract OWL classes.
 * Uses the centralized TTL cache to ensure consistency.
 */
export async function fetchExternalOntologyClasses(
  url: string,
  externalRefs?: ExternalOntologyReference[]
): Promise<ExternalClassInfo[]> {
  // Normalize URL (remove trailing # if present)
  const normalizedUrl = url.endsWith('#') ? url.slice(0, -1) : url;
  
  // Check parsed classes cache first
  if (externalClassesCache.has(normalizedUrl)) {
    return externalClassesCache.get(normalizedUrl)!;
  }

  // Fetch TTL content (uses centralized cache)
  const ttlText = await fetchExternalOntologyTtl(url);
  if (!ttlText) {
    return [];
  }

  // Parse classes from the cached TTL
  return await parseOntologyContent(ttlText, normalizedUrl, externalRefs);
}

/**
 * Fetches and parses an external ontology to extract OWL object properties.
 * Uses the centralized TTL cache to ensure consistency.
 */
export async function fetchExternalOntologyObjectProperties(
  url: string,
  externalRefs?: ExternalOntologyReference[]
): Promise<ExternalObjectPropertyInfo[]> {
  // Normalize URL (remove trailing # if present)
  const normalizedUrl = url.endsWith('#') ? url.slice(0, -1) : url;
  
  // Check parsed object properties cache first
  if (externalObjectPropertiesCache.has(normalizedUrl)) {
    return externalObjectPropertiesCache.get(normalizedUrl)!;
  }

  // Fetch TTL content (uses centralized cache - same as classes)
  const ttlText = await fetchExternalOntologyTtl(url);
  if (!ttlText) {
    return [];
  }

  // Parse object properties from the cached TTL
  const objectProperties = await parseOntologyObjectProperties(ttlText, normalizedUrl, externalRefs);
  externalObjectPropertiesCache.set(normalizedUrl, objectProperties);
  return objectProperties;
}

/**
 * Searches for classes across multiple external ontologies.
 * Matches are case-insensitive and search both localName and label.
 * Results are sorted by relevance (exact matches first, then alphabetically).
 */
export async function searchExternalClasses(
  query: string,
  externalRefs: ExternalOntologyReference[]
): Promise<ExternalClassInfo[]> {
  if (!query.trim()) return [];
  
  const queryLower = query.toLowerCase().trim();
  const allResults: ExternalClassInfo[] = [];
  
  console.log(`Searching for "${queryLower}" across ${externalRefs.length} ontology(ies)`);
  
  for (const ref of externalRefs) {
    try {
      const classes = await fetchExternalOntologyClasses(ref.url, externalRefs);
      console.log(`Found ${classes.length} classes in ${ref.url}`);
      const matches = classes.filter((cls) => {
        const localNameLower = cls.localName.toLowerCase();
        const labelLower = cls.label.toLowerCase();
        const nameMatch = localNameLower.includes(queryLower) || 
                          labelLower.includes(queryLower);
        return nameMatch;
      });
      console.log(`Found ${matches.length} matches in ${ref.url}`);
      allResults.push(...matches);
    } catch (err) {
      console.error(`Error searching in ${ref.url}:`, err);
    }
  }
  
  console.log(`Total matches: ${allResults.length}`);
  
  // Sort by relevance (exact matches first, then by name)
  return allResults.sort((a, b) => {
    const aLocalLower = a.localName.toLowerCase();
    const aLabelLower = a.label.toLowerCase();
    const bLocalLower = b.localName.toLowerCase();
    const bLabelLower = b.label.toLowerCase();
    
    const aExact = aLocalLower === queryLower || aLabelLower === queryLower;
    const bExact = bLocalLower === queryLower || bLabelLower === queryLower;
    
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    
    // If both start with query, prioritize by which starts earlier
    const aStarts = aLocalLower.startsWith(queryLower) || aLabelLower.startsWith(queryLower);
    const bStarts = bLocalLower.startsWith(queryLower) || bLabelLower.startsWith(queryLower);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    
    return a.label.localeCompare(b.label);
  });
}

/**
 * Searches for object properties across multiple external ontologies.
 * Matches are case-insensitive and search both localName and label.
 * Results are sorted by relevance (exact matches first, then alphabetically).
 */
export async function searchExternalObjectProperties(
  query: string,
  externalRefs: ExternalOntologyReference[]
): Promise<ExternalObjectPropertyInfo[]> {
  if (!query.trim()) return [];
  
  const queryLower = query.toLowerCase().trim();
  const allResults: ExternalObjectPropertyInfo[] = [];
  
  console.log(`Searching for object properties "${queryLower}" across ${externalRefs.length} ontology(ies)`);
  
  for (const ref of externalRefs) {
    try {
      const objectProperties = await fetchExternalOntologyObjectProperties(ref.url, externalRefs);
      console.log(`Found ${objectProperties.length} object properties in ${ref.url}`);
      const matches = objectProperties.filter((op) => {
        const localNameLower = op.localName.toLowerCase();
        const labelLower = op.label.toLowerCase();
        const nameMatch = localNameLower.includes(queryLower) || 
                          labelLower.includes(queryLower);
        return nameMatch;
      });
      console.log(`Found ${matches.length} matches in ${ref.url}`);
      allResults.push(...matches);
    } catch (err) {
      console.error(`Error searching object properties in ${ref.url}:`, err);
    }
  }
  
  console.log(`Total object property matches: ${allResults.length}`);
  
  // Sort by relevance (exact matches first, then by name)
  return allResults.sort((a, b) => {
    const aLocalLower = a.localName.toLowerCase();
    const aLabelLower = a.label.toLowerCase();
    const bLocalLower = b.localName.toLowerCase();
    const bLabelLower = b.label.toLowerCase();
    
    const aExact = aLocalLower === queryLower || aLabelLower === queryLower;
    const bExact = bLocalLower === queryLower || bLabelLower === queryLower;
    
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    
    // If both start with query, prioritize by which starts earlier
    const aStarts = aLocalLower.startsWith(queryLower) || aLabelLower.startsWith(queryLower);
    const bStarts = bLocalLower.startsWith(queryLower) || bLabelLower.startsWith(queryLower);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    
    return a.label.localeCompare(b.label);
  });
}

/**
 * Clears the cache of fetched external ontology classes.
 * Useful for testing or when you want to force a refetch.
 */
export function clearExternalClassesCache(): void {
  externalClassesCache.clear();
  externalObjectPropertiesCache.clear();
  externalTtlCache.clear();
}

/**
 * Pre-fetches and caches all external ontology TTL content.
 * Should be called when external references are loaded to avoid fetching on every search.
 * This ensures the TTL is fetched once and reused for both classes and object properties.
 */
export async function preloadExternalOntologyClasses(
  externalRefs: ExternalOntologyReference[]
): Promise<void> {
  console.log(`Pre-loading TTL content for ${externalRefs.length} external ontology(ies)...`);
  const promises = externalRefs.map(async (ref) => {
    try {
      // Fetch and cache the TTL content (this will be reused for both classes and object properties)
      const ttlText = await fetchExternalOntologyTtl(ref.url);
      if (ttlText) {
        console.log(`Successfully pre-loaded TTL for ${ref.url} (${ttlText.length} characters)`);
        // Pre-parse classes and object properties to warm up the caches
        await fetchExternalOntologyClasses(ref.url, externalRefs);
        await fetchExternalOntologyObjectProperties(ref.url, externalRefs);
      } else {
        console.warn(`Failed to pre-load TTL for ${ref.url}`);
      }
    } catch (err) {
      console.warn(`Failed to pre-load ${ref.url}:`, err);
    }
  });
  await Promise.allSettled(promises);
  console.log('Finished pre-loading external ontologies');
}
