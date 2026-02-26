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
