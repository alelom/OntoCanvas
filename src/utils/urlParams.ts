/**
 * Utility functions for parsing URL parameters.
 */

/**
 * Get the local file token from the 'localFile' URL parameter.
 * 
 * @returns The token if present, or null if not found
 */
export function getLocalFileTokenFromParams(): string | null {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('localFile');
  return token || null;
}

/**
 * Get the ontology URL from the 'onto' URL parameter.
 * Supports both encoded and unencoded URLs.
 * 
 * @returns The ontology URL if present and valid, or null if not found or invalid
 */
export function getOntologyUrlFromParams(): string | null {
  const params = new URLSearchParams(window.location.search);
  const ontoParam = params.get('onto');
  
  if (!ontoParam) {
    return null;
  }
  
  // Try to use the parameter as-is first (for simple URLs like ?onto=https://w3id.org/dano)
  let url: string;
  try {
    // Check if it looks like a valid URL
    if (ontoParam.startsWith('http://') || ontoParam.startsWith('https://')) {
      // Validate by creating a URL object
      new URL(ontoParam);
      url = ontoParam;
    } else {
      // Try decoding (for encoded URLs like ?onto=https%3A%2F%2Fw3id.org%2Fdano)
      url = decodeURIComponent(ontoParam);
      // Validate the decoded URL
      new URL(url);
    }
  } catch (e) {
    // If decoding fails or URL is invalid, try decoding the original
    try {
      url = decodeURIComponent(ontoParam);
      new URL(url);
    } catch (decodeError) {
      // Invalid URL parameter
      return null;
    }
  }
  
  // Final validation - ensure it's a valid URL
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

/**
 * Construct the display file URL from an ontology URL.
 * If the ontology URL is {base}.html or {base}.ttl, returns {base}.display.json
 * Handles both .html and .ttl URLs by extracting the base name (removing extension).
 * 
 * @param ontologyUrl - The ontology URL
 * @returns The display file URL, or null if the ontology URL is invalid
 */
export function getDisplayFileUrl(ontologyUrl: string): string | null {
  try {
    const url = new URL(ontologyUrl);
    const pathname = url.pathname;
    
    // Remove trailing slash if present
    const cleanPath = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
    
    // Extract the base name (everything before the last dot)
    const lastSlashIndex = cleanPath.lastIndexOf('/');
    const fileName = lastSlashIndex >= 0 ? cleanPath.slice(lastSlashIndex + 1) : cleanPath;
    
    // Find the last dot to determine the extension
    const lastDotIndex = fileName.lastIndexOf('.');
    
    let baseName: string;
    if (lastDotIndex > 0) {
      // Has an extension, remove it (works for both .html and .ttl)
      baseName = fileName.slice(0, lastDotIndex);
    } else {
      // No extension, use the full filename
      baseName = fileName;
    }
    
    // Construct the display file path
    const displayFileName = `${baseName}.display.json`;
    const displayPath = lastSlashIndex >= 0 
      ? cleanPath.slice(0, lastSlashIndex + 1) + displayFileName
      : '/' + displayFileName;
    
    // Construct the full URL
    url.pathname = displayPath;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Get all possible display file URLs to try for a given ontology URL.
 * Returns an array with the primary URL first, followed by alternatives.
 * For .html URLs, also includes the .ttl-based display file URL.
 * 
 * @param ontologyUrl - The ontology URL
 * @returns Array of display file URLs to try (primary first, then alternatives)
 */
export function getAllDisplayFileUrls(ontologyUrl: string): string[] {
  const urls: string[] = [];
  
  // Primary URL (based on current extension)
  const primaryUrl = getDisplayFileUrl(ontologyUrl);
  if (primaryUrl) {
    urls.push(primaryUrl);
  }
  
  // For .html URLs, also try the .ttl-based display file
  try {
    const url = new URL(ontologyUrl);
    const pathname = url.pathname;
    
    // Remove trailing slash if present
    const cleanPath = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
    
    // Extract the base name
    const lastSlashIndex = cleanPath.lastIndexOf('/');
    const fileName = lastSlashIndex >= 0 ? cleanPath.slice(lastSlashIndex + 1) : cleanPath;
    
    // Check if URL ends with .html
    if (fileName.toLowerCase().endsWith('.html')) {
      // Construct .ttl-based display file URL
      const baseName = fileName.slice(0, -5); // Remove .html
      const displayFileName = `${baseName}.display.json`;
      const displayPath = lastSlashIndex >= 0 
        ? cleanPath.slice(0, lastSlashIndex + 1) + displayFileName
        : '/' + displayFileName;
      
      const altUrl = new URL(ontologyUrl);
      altUrl.pathname = displayPath;
      const altUrlString = altUrl.toString();
      
      // Only add if it's different from the primary URL
      if (altUrlString !== primaryUrl) {
        urls.push(altUrlString);
      }
    }
  } catch {
    // Ignore errors, just return what we have
  }
  
  return urls;
}