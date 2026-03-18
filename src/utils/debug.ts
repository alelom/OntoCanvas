/**
 * Debug flag management.
 * Checks URL parameter 'debug', localStorage 'ontologyEditorDebug', and localhost to enable verbose logging.
 */

const DEBUG_URL_PARAM = 'debug';
const DEBUG_LOCALSTORAGE_KEY = 'ontologyEditorDebug';

/**
 * Check if we're running on localhost (local development).
 */
function isLocalhost(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  
  try {
    const hostname = window.location.hostname;
    // Check for common localhost values
    return hostname === 'localhost' || 
           hostname === '127.0.0.1' || 
           hostname === '::1' ||
           hostname === '[::1]' ||
           hostname.startsWith('192.168.') ||
           hostname.startsWith('10.') ||
           hostname.startsWith('172.16.') ||
           hostname.startsWith('172.17.') ||
           hostname.startsWith('172.18.') ||
           hostname.startsWith('172.19.') ||
           hostname.startsWith('172.20.') ||
           hostname.startsWith('172.21.') ||
           hostname.startsWith('172.22.') ||
           hostname.startsWith('172.23.') ||
           hostname.startsWith('172.24.') ||
           hostname.startsWith('172.25.') ||
           hostname.startsWith('172.26.') ||
           hostname.startsWith('172.27.') ||
           hostname.startsWith('172.28.') ||
           hostname.startsWith('172.29.') ||
           hostname.startsWith('172.30.') ||
           hostname.startsWith('172.31.');
  } catch {
    return false;
  }
}

/**
 * Check if debug mode is enabled.
 * Debug mode is enabled if:
 * - Running on localhost (local development)
 * - URL parameter 'debug' is present (any value)
 * - localStorage 'ontologyEditorDebug' is set to 'true'
 * 
 * Returns false in Node.js environment (for unit tests).
 */
export function isDebugMode(): boolean {
  // In Node.js environment (unit tests), check environment variable
  if (typeof window === 'undefined') {
    // Allow enabling debug mode via environment variable for tests
    return process.env.ONTOLOGY_EDITOR_DEBUG === 'true' || process.env.DEBUG === 'true';
  }
  
  // Auto-enable on localhost (local development)
  if (isLocalhost()) {
    return true;
  }
  
  // Check URL parameter
  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has(DEBUG_URL_PARAM)) {
      return true;
    }
  } catch {
    // window.location may not be available in some contexts
  }
  
  // Check localStorage
  try {
    const stored = localStorage.getItem(DEBUG_LOCALSTORAGE_KEY);
    if (stored === 'true') {
      return true;
    }
  } catch {
    // localStorage may not be available (e.g., in private browsing)
  }
  
  return false;
}

/**
 * Enable debug mode by setting localStorage.
 */
export function enableDebugMode(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DEBUG_LOCALSTORAGE_KEY, 'true');
  } catch {
    // localStorage may not be available
  }
}

/**
 * Disable debug mode by removing from localStorage.
 */
export function disableDebugMode(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(DEBUG_LOCALSTORAGE_KEY);
  } catch {
    // localStorage may not be available
  }
}

/**
 * Debug logging function that only logs if debug mode is enabled.
 */
export function debugLog(...args: unknown[]): void {
  if (isDebugMode()) {
    console.log(...args);
  }
}

/**
 * Debug warning function that only logs if debug mode is enabled.
 */
export function debugWarn(...args: unknown[]): void {
  if (isDebugMode()) {
    console.warn(...args);
  }
}

/**
 * Debug error function that only logs if debug mode is enabled.
 */
export function debugError(...args: unknown[]): void {
  if (isDebugMode()) {
    console.error(...args);
  }
}
