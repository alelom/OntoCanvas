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

export interface ExternalOntologyReference {
  url: string;
  usePrefix: boolean;
  prefix?: string;
}

/**
 * Fetches and parses an external ontology to extract OWL classes.
 * Results are cached per URL to avoid redundant fetches.
 */
const externalClassesCache: Map<string, ExternalClassInfo[]> = new Map();

export async function fetchExternalOntologyClasses(
  url: string,
  externalRefs?: ExternalOntologyReference[]
): Promise<ExternalClassInfo[]> {
  // Normalize URL (remove trailing # if present)
  const normalizedUrl = url.endsWith('#') ? url.slice(0, -1) : url;
  
  // Check cache first
  if (externalClassesCache.has(normalizedUrl)) {
    return externalClassesCache.get(normalizedUrl)!;
  }

  try {
    console.log(`Fetching external ontology from: ${normalizedUrl} with content negotiation`);
    
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
      return [];
    }
    
    const contentType = response.headers.get('content-type') || '';
    const finalUrl = response.url; // Get final URL after redirects
    console.log(`Fetched ${response.status} from ${normalizedUrl}, final URL: ${finalUrl}, content-type: ${contentType}`);
    
    const text = await response.text();
    console.log(`Fetched ${text.length} characters, content-type: ${contentType}`);
    
    if (!text.trim()) {
      console.warn(`Empty response from ${normalizedUrl}`);
      return [];
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
      console.warn(`  This may be because the server checks User-Agent and serves HTML to browsers.`);
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
          console.log(`Fetching Turtle content from alternate link...`);
          
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
              const turtleText = await turtleResponse.text();
              const turtleContentType = turtleResponse.headers.get('content-type') || '';
              console.log(`Successfully fetched Turtle from alternate link: ${turtleUrl}, content-type: ${turtleContentType}`);
              
              if (turtleText.trim() && !turtleText.trim().toLowerCase().startsWith('<!doctype')) {
                return await parseOntologyContent(turtleText, normalizedUrl, externalRefs);
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
        // 1. Replace last part with dano.ttl (if path ends with index.html or similar)
        // 2. Append dano.ttl to the path
        // 3. Replace entire path with /dano/dano.ttl if it's the root
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
              const turtleText = await turtleResponse.text();
              const turtleContentType = turtleResponse.headers.get('content-type') || '';
              
              if (turtleText.trim() && !turtleText.trim().toLowerCase().startsWith('<!doctype')) {
                console.log(`Successfully fetched Turtle from direct URL: ${turtleUrl}, content-type: ${turtleContentType}`);
                return await parseOntologyContent(turtleText, normalizedUrl, externalRefs);
              }
            }
          } catch (directErr) {
            // Continue to next pattern
            console.warn(`Failed to fetch from direct URL ${turtleUrl}:`, directErr);
          }
        }
      }
      
      console.error(`Could not find or fetch Turtle content from HTML alternate links or direct URLs.`);
      console.error(`  Final URL: ${finalUrl}`);
      console.error(`  Content-Type: ${contentType}`);
      console.error(`  Note: curl -L -H "Accept: text/turtle" ${normalizedUrl} works, but browser fetch doesn't.`);
      console.error(`  This is likely due to User-Agent detection by the server.`);
      return [];
    }
    
    if (isRdfContent) {
      // Content negotiation succeeded - parse the RDF/Turtle content
      return await parseOntologyContent(text, normalizedUrl, externalRefs);
    }
    
    // If we get here, we have content but it's not clearly RDF or HTML
    // Try to parse it anyway (might be RDF without proper content-type header)
    console.warn(`Unclear content type from ${normalizedUrl}, attempting to parse as Turtle`);
    try {
      return await parseOntologyContent(text, normalizedUrl, externalRefs);
    } catch (parseErr) {
      console.error(`Failed to parse content from ${normalizedUrl}:`, parseErr);
      return [];
    }
  } catch (err) {
    console.error(`Failed to fetch classes from ${normalizedUrl}:`, err);
    return [];
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
 * Clears the cache of fetched external ontology classes.
 * Useful for testing or when you want to force a refetch.
 */
export function clearExternalClassesCache(): void {
  externalClassesCache.clear();
}

/**
 * Pre-fetches and caches all external ontology classes.
 * Should be called when external references are loaded to avoid fetching on every search.
 */
export async function preloadExternalOntologyClasses(
  externalRefs: ExternalOntologyReference[]
): Promise<void> {
  console.log(`Pre-loading ${externalRefs.length} external ontology(ies)...`);
  const promises = externalRefs.map(async (ref) => {
    try {
      await fetchExternalOntologyClasses(ref.url, externalRefs);
    } catch (err) {
      console.warn(`Failed to pre-load ${ref.url}:`, err);
    }
  });
  await Promise.allSettled(promises);
  console.log('Finished pre-loading external ontologies');
}
