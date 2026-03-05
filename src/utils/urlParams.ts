/**
 * Utility functions for parsing URL parameters.
 */

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
      // Has an extension, remove it
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