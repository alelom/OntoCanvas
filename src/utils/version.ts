/**
 * Get the application version.
 * Tries to read from Vite environment variable first (injected at build time),
 * falls back to reading from package.json.
 */
import packageJson from '../../package.json';

export function getAppVersion(): string {
  // Try Vite environment variable first (injected at build time)
  if (import.meta.env.VITE_APP_VERSION) {
    return import.meta.env.VITE_APP_VERSION;
  }
  
  // Fallback to package.json
  return packageJson.version;
}
