import { Parser, Store } from 'n3';
import { extractLocalName } from './parser';

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
async function fetchExternalOntologyTtl(
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
    const response = await fetch(normalizedUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/turtle',
        'User-Agent': 'curl/8.0.0', // Override browser User-Agent to get Turtle instead of HTML
      },
      redirect: 'follow', // Explicitly follow redirects (like curl -L)
    });
    
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
            const turtleResponse = await fetch(turtleUrl, {
              method: 'GET',
              headers: {
                'Accept': 'text/turtle',
                'User-Agent': 'curl/8.0.0',
              },
              redirect: 'follow',
            });
            
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
      
      // Check if the final URL is from GitHub Pages (common pattern for ontology hosting)
      if (finalUrl.includes('github.io') || finalUrl.includes('github.com')) {
        // Try to construct the Turtle URL by appending /dano.ttl or replacing path with /dano.ttl
        const urlObj = new URL(finalUrl);
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        
        // Try different patterns:
        const turtleUrlPatterns = [
          `${urlObj.origin}/${pathParts[0]}/dano.ttl`, // e.g., github.io/dano/dano.ttl
          `${urlObj.origin}/dano.ttl`, // e.g., github.io/dano.ttl
          `${urlObj.origin}/${pathParts.join('/')}/dano.ttl`, // Append to existing path
        ];
        
        // Also try based on the original normalized URL
        if (normalizedUrl.includes('w3id.org/dano')) {
          turtleUrlPatterns.unshift('https://rub-informatik-im-bauwesen.github.io/dano/dano.ttl');
        }
        
        for (const turtleUrl of turtleUrlPatterns) {
          try {
            console.log(`Trying direct Turtle URL: ${turtleUrl}`);
            const turtleResponse = await fetch(turtleUrl, {
              method: 'GET',
              headers: {
                'Accept': 'text/turtle',
                'User-Agent': 'curl/8.0.0',
              },
              redirect: 'follow',
            });
            
            if (turtleResponse.ok) {
              text = await turtleResponse.text();
              const turtleContentType = turtleResponse.headers.get('content-type') || '';
              
              if (text.trim() && !text.trim().toLowerCase().startsWith('<!doctype')) {
                console.log(`Successfully fetched Turtle from direct URL: ${turtleUrl}, content-type: ${turtleContentType}`);
                // Cache and return the TTL text
                externalTtlCache.set(normalizedUrl, text);
                return text;
              }
            }
          } catch (directErr) {
            // Continue to next pattern
            console.warn(`Failed to fetch from direct URL ${turtleUrl}:`, directErr);
          }
        }
      }
      
      console.error(`Could not find or fetch Turtle content from ${normalizedUrl}`);
      console.error(`  Final URL: ${finalUrl}`);
      console.error(`  Content-Type: ${contentType}`);
      return null;
    }
    
    if (isRdfContent) {
      // Content negotiation succeeded - cache and return the TTL text
      externalTtlCache.set(normalizedUrl, text);
      return text;
    }
    
    // If we get here, we have content but it's not clearly RDF or HTML
    // Try to parse it anyway (might be RDF without proper content-type header)
    console.warn(`Unclear content type from ${normalizedUrl}, assuming it's Turtle`);
    // Cache and return the text anyway
    externalTtlCache.set(normalizedUrl, text);
    return text;
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
      
      const localName = extractLocalName(uri);
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
      
      const localName = extractLocalName(uri);
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
