/**
 * Debug flag management.
 * Checks URL parameter 'debug' and localStorage 'ontologyEditorDebug' to enable verbose logging.
 */

const DEBUG_URL_PARAM = 'debug';
const DEBUG_LOCALSTORAGE_KEY = 'ontologyEditorDebug';

/**
 * Check if debug mode is enabled.
 * Debug mode is enabled if:
 * - URL parameter 'debug' is present (any value)
 * - localStorage 'ontologyEditorDebug' is set to 'true'
 * 
 * Returns false in Node.js environment (for unit tests).
 */
export function isDebugMode(): boolean {
  // In Node.js environment (unit tests), window is not available
  if (typeof window === 'undefined') {
    return false;
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
