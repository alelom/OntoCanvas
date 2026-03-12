/**
 * Utilities for validating example image URLs and checking their reachability.
 */

// Common image file extensions
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|svg|ico|tiff?|avif|heic|heif)$/i;

/**
 * Check if a URL has a valid image file extension.
 */
export function hasValidImageExtension(url: string): boolean {
  // Remove query parameters and fragments for extension check
  const urlWithoutQuery = url.split('?')[0].split('#')[0];
  return IMAGE_EXTENSIONS.test(urlWithoutQuery);
}

/**
 * Convert GitHub blob URLs to raw.githubusercontent.com URLs.
 * Example: https://github.com/owner/repo/blob/branch/path.png
 * Converts to: https://raw.githubusercontent.com/owner/repo/refs/heads/branch/path.png
 */
function convertGitHubBlobToRaw(url: string): string {
  const githubBlobPattern = /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)$/;
  const match = url.match(githubBlobPattern);
  if (match) {
    const [, owner, repo, branch, path] = match;
    return `https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/${branch}/${path}`;
  }
  return url;
}

/**
 * Resolve a relative URL to an absolute URL based on the ontology location.
 * If the URL is already absolute, returns it as-is (after converting GitHub blob URLs to raw).
 * If the ontology location is a URL, constructs the full URL.
 * If the ontology location is a file path, returns null (can't resolve).
 */
export function resolveImageUrl(imageUrl: string, ontologyLocation: string | null): string | null {
  // If already absolute, convert GitHub blob URLs to raw and return
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return convertGitHubBlobToRaw(imageUrl);
  }

  // If no ontology location, can't resolve relative URL
  if (!ontologyLocation) {
    return null;
  }

  try {
    // Try to parse ontology location as URL
    const baseUrl = new URL(ontologyLocation);
    
    // Ensure the base URL ends with '/' so relative URLs resolve correctly
    // If the base URL doesn't end with '/', it's treated as a file and the last segment gets replaced
    // We want to treat it as a directory so relative URLs are appended
    const pathname = baseUrl.pathname;
    if (!pathname.endsWith('/')) {
      // Check if the pathname ends with a file extension (likely a file)
      const hasFileExtension = /\.\w+$/.test(pathname);
      
      if (!hasFileExtension) {
        // No file extension, treat as directory and add trailing slash to pathname
        baseUrl.pathname = pathname + '/';
      } else {
        // Has file extension, use the directory part
        const lastSlashIndex = pathname.lastIndexOf('/');
        if (lastSlashIndex >= 0) {
          baseUrl.pathname = pathname.substring(0, lastSlashIndex + 1);
        } else {
          // No slash in pathname, just use root
          baseUrl.pathname = '/';
        }
      }
    }
    
    // Resolve relative URL against base URL
    return new URL(imageUrl, baseUrl.toString()).toString();
  } catch {
    // Ontology location is not a valid URL (e.g., local file path)
    // Can't resolve relative URLs in this case
    return null;
  }
}

/**
 * Test if a URL loads as an image using an <img> element.
 * This works cross-origin (no CORS needed) but can't verify content-type.
 * Returns true if the image loads successfully, false otherwise.
 */
function testImageWithImgElement(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timeoutId = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      resolve(false);
    }, 500);
    
    img.onload = () => {
      clearTimeout(timeoutId);
      resolve(true);
    };
    
    img.onerror = () => {
      clearTimeout(timeoutId);
      resolve(false);
    };
    
    img.src = url;
  });
}

/**
 * Check if a URL is reachable and returns an image.
 * Uses HEAD request first with CORS mode to check content-type.
 * Falls back to GET if HEAD fails.
 * If CORS blocks us, falls back to testing with an <img> element.
 * Timeout: 500ms (0.5 seconds).
 */
export async function isImageUrlReachable(url: string): Promise<boolean> {
  try {
    // Strategy 1: Try HEAD with CORS to check content-type
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 500);
    
    try {
      const headResponse = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        // Default mode is 'cors' - allows reading headers if server allows CORS
      });
      clearTimeout(timeoutId);
      
      // If HEAD succeeds, check content type
      const contentType = headResponse.headers.get('content-type');
      if (contentType && contentType.startsWith('image/')) {
        return true;
      }
      // If content-type exists but isn't image, it's invalid
      if (contentType && !contentType.startsWith('image/')) {
        return false;
      }
      // If no content-type header, try GET
    } catch (headError) {
      clearTimeout(timeoutId);
      
      // Check if it's a CORS error
      const isCorsError = headError instanceof TypeError && 
        (headError.message.includes('Failed to fetch') || 
         headError.message.includes('CORS') ||
         headError.message.includes('network'));
      
      if (isCorsError) {
        // CORS blocked - fall back to <img> element test
        return await testImageWithImgElement(url);
      }
      
      // Other error (timeout, network, etc.) - try GET
    }

    // Strategy 2: Try GET with CORS
    const getController = new AbortController();
    const getTimeoutId = setTimeout(() => getController.abort(), 500);
    
    try {
      const getResponse = await fetch(url, {
        method: 'GET',
        signal: getController.signal,
        // Default mode is 'cors'
      });
      clearTimeout(getTimeoutId);
      
      const contentType = getResponse.headers.get('content-type');
      if (contentType && contentType.startsWith('image/')) {
        return true;
      }
      if (contentType && !contentType.startsWith('image/')) {
        return false;
      }
      
      // No content-type header - fall back to <img> element test
      return await testImageWithImgElement(url);
    } catch (getError) {
      clearTimeout(getTimeoutId);
      
      // Check if it's a CORS error
      const isCorsError = getError instanceof TypeError && 
        (getError.message.includes('Failed to fetch') || 
         getError.message.includes('CORS') ||
         getError.message.includes('network'));
      
      if (isCorsError) {
        // CORS blocked - fall back to <img> element test
        return await testImageWithImgElement(url);
      }
      
      // Other error - failed
      return false;
    }
  } catch {
    return false;
  }
}

/**
 * Validate an example image URL: check extension and reachability.
 * Returns null if valid, or an error message if invalid.
 */
export async function validateExampleImageUrl(
  url: string,
  ontologyLocation: string | null
): Promise<string | null> {
  if (!url || !url.trim()) {
    return 'URL cannot be empty';
  }

  const trimmedUrl = url.trim();
  const issues: string[] = [];

  // Check if it has a valid image extension
  if (!hasValidImageExtension(trimmedUrl)) {
    issues.push('URL must point to an image file (png, jpg, gif, webp, bmp, svg, etc.)');
  }

  // Resolve relative URLs (this also converts GitHub blob URLs to raw)
  const resolvedUrl = resolveImageUrl(trimmedUrl, ontologyLocation);
  const isRelative = !trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://');
  const wasGitHubBlob = trimmedUrl.includes('github.com') && trimmedUrl.includes('/blob/');
  
  if (!resolvedUrl) {
    // Can't resolve - add this as an issue
    issues.push('Cannot resolve relative URL. Please provide an absolute URL or ensure the ontology is loaded from a URL.');
    // Return the issues without a resolved URL since we don't have one
    if (issues.length > 0) {
      return issues.join('; ');
    }
    return 'Cannot resolve relative URL. Please provide an absolute URL or ensure the ontology is loaded from a URL.';
  }

  // If we have a resolved URL, check reachability
  const isReachable = await isImageUrlReachable(resolvedUrl);
  if (!isReachable) {
    issues.push('URL is not reachable or does not return an image');
  }

  // If there are issues, format the error message with the resolved URL
  if (issues.length > 0) {
    if (isRelative) {
      return `The input image relative URL resolves to a full URL: ${resolvedUrl} which has these issues: ${issues.join('; ')}`;
    } else if (wasGitHubBlob && resolvedUrl !== trimmedUrl) {
      // Show that GitHub blob URL was converted to raw
      return `The GitHub blob URL was converted to: ${resolvedUrl} which has these issues: ${issues.join('; ')}`;
    } else {
      return `The URL ${resolvedUrl} has these issues: ${issues.join('; ')}`;
    }
  }

  return null; // Valid
}
