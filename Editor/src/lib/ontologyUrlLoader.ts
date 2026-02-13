/**
 * Fetches an ontology from a URL, handling content negotiation and HTML fallbacks.
 * 
 * This function attempts multiple strategies to fetch Turtle content:
 * 1. Direct fetch with proper Accept headers
 * 2. Extract alternate links from HTML responses
 * 3. Infer TTL URL from GitHub repository links
 * 4. Try common TTL file name patterns
 * 
 * @param url - The URL to fetch the ontology from
 * @param timeoutMs - Request timeout in milliseconds (default: 10000)
 * @returns The Turtle content as a string
 * @throws Error if the ontology cannot be fetched
 */
export async function fetchOntologyFromUrl(url: string, timeoutMs: number = 10000): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    // Fetch the URL with proper content negotiation
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/turtle, application/turtle, text/n3, application/n-triples, application/rdf+xml, */*',
        'User-Agent': 'curl/8.0.0',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    let ttl: string;

    // Check if we got HTML (common when servers serve HTML to browsers)
    if (contentType.includes('text/html')) {
      // Try to extract alternate link from HTML
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Try multiple methods to find the TTL URL
      let ttlUrl: string | null = null;
      
      // Method 1: Look for alternate link with type="text/turtle"
      const alternateLink = doc.querySelector('link[rel="alternate"][type="text/turtle"]') as HTMLLinkElement;
      if (alternateLink && alternateLink.href) {
        ttlUrl = new URL(alternateLink.href, url).href;
      }
      
      // Method 2: If no alternate link, try to extract from GitHub source link
      if (!ttlUrl) {
        ttlUrl = await tryInferTtlFromGitHub(doc, url, timeoutMs);
      }
      
      // Method 3: Try common TTL file names at the same path
      if (!ttlUrl) {
        ttlUrl = await tryCommonTtlPaths(url, timeoutMs);
      }
      
      if (ttlUrl) {
        const altController = new AbortController();
        const altTimeoutId = setTimeout(() => altController.abort(), timeoutMs);
        try {
          const altResponse = await fetch(ttlUrl, {
            headers: {
              'Accept': 'text/turtle',
              'User-Agent': 'curl/8.0.0',
            },
            signal: altController.signal,
          });
          clearTimeout(altTimeoutId);
          if (!altResponse.ok) {
            throw new Error(`Failed to fetch TTL from discovered URL: HTTP ${altResponse.status}`);
          }
          ttl = await altResponse.text();
        } catch (err) {
          clearTimeout(altTimeoutId);
          if (err instanceof Error && err.name === 'AbortError') {
            throw new Error(`Request timeout while fetching TTL from ${ttlUrl}`);
          }
          throw err;
        }
      } else {
        throw new Error('Server returned HTML instead of Turtle. Could not find alternate TTL link or infer TTL URL from page content.');
      }
    } else {
      ttl = await response.text();
    }

    return ttl;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request timeout while fetching ${url} (exceeded ${timeoutMs}ms)`);
    }
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error(`Network error: Failed to connect to ${url}. Please check your internet connection and try again.`);
    }
    throw err;
  }
}

/**
 * Attempts to infer the TTL URL from GitHub repository links in the HTML.
 */
async function tryInferTtlFromGitHub(doc: Document, baseUrl: string, timeoutMs: number = 10000): Promise<string | null> {
  const sourceLink = doc.querySelector('a[href*="github.com"]') as HTMLAnchorElement;
  if (!sourceLink || !sourceLink.href) {
    return null;
  }

  try {
    const githubUrl = new URL(sourceLink.href);
    const pathParts = githubUrl.pathname.split('/').filter(p => p);
    if (pathParts.length >= 2) {
      const owner = pathParts[0];
      const repo = pathParts[1];
      // Try GitHub Pages URL pattern: https://owner.github.io/repo/repo.ttl
      const possibleUrls = [
        `https://${owner}.github.io/${repo}/${repo}.ttl`,
        `https://${owner}.github.io/${repo}/ontology.ttl`,
        `https://raw.githubusercontent.com/${owner}/${repo}/main/${repo}.ttl`,
        `https://raw.githubusercontent.com/${owner}/${repo}/master/${repo}.ttl`,
      ];
      
      // Try URLs in parallel with timeout
      const fetchPromises = possibleUrls.map(async (possibleUrl) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const testResponse = await fetch(possibleUrl, {
            headers: {
              'Accept': 'text/turtle',
              'User-Agent': 'curl/8.0.0',
            },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (testResponse.ok) {
            const testContentType = testResponse.headers.get('content-type') || '';
            if (testContentType.includes('text/turtle') || testContentType.includes('text/plain')) {
              return possibleUrl;
            }
          }
        } catch {
          clearTimeout(timeoutId);
          // Continue to next URL
        }
        return null;
      });
      
      // Wait for first successful fetch
      const results = await Promise.allSettled(fetchPromises);
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          return result.value;
        }
      }
    }
  } catch {
    // Invalid URL or parsing error
  }

  return null;
}

/**
 * Tries common TTL file name patterns at the same path as the original URL.
 */
async function tryCommonTtlPaths(url: string, timeoutMs: number = 10000): Promise<string | null> {
  try {
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    const possibleUrls = [
      `${baseUrl}.ttl`,
      `${baseUrl}/ontology.ttl`,
      `${baseUrl.replace(/\/$/, '')}.ttl`,
    ];
    
    // Try URLs in parallel with timeout
    const fetchPromises = possibleUrls.map(async (possibleUrl) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const testResponse = await fetch(possibleUrl, {
          headers: {
            'Accept': 'text/turtle',
            'User-Agent': 'curl/8.0.0',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (testResponse.ok) {
          const testContentType = testResponse.headers.get('content-type') || '';
          if (testContentType.includes('text/turtle') || testContentType.includes('text/plain')) {
            return possibleUrl;
          }
        }
      } catch {
        clearTimeout(timeoutId);
        // Continue to next URL
      }
      return null;
    });
    
    // Wait for first successful fetch
    const results = await Promise.allSettled(fetchPromises);
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        return result.value;
      }
    }
  } catch {
    // Invalid URL
  }

  return null;
}
