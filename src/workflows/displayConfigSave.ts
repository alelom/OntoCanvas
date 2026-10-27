/**
 * Saving the display config to the browser: scheduling it after a change, saving it at once, and reading the first one
 * found. Moved out of main.ts (#175).
 */
import { fileState, canvasState } from '../state/appState';
import { saveDisplayConfigToIndexedDB, type DisplayConfig } from '../storage';
import { collectDisplayConfig, loadDisplayConfigFromUrl } from './displayConfigFiles';

export function scheduleDisplayConfigSave(): void {
  if (canvasState.displayConfigSaveTimer != null) window.clearTimeout(canvasState.displayConfigSaveTimer);
  canvasState.displayConfigSaveTimer = window.setTimeout(() => {
    canvasState.displayConfigSaveTimer = null;
    flushDisplayConfigSave();
  }, 500);
}

/** Run display config save immediately (e.g. after drag end so refresh preserves positions). */
export function flushDisplayConfigSave(): void {
  const config = collectDisplayConfig({ forBrowser: true });
  if (config) saveDisplayConfigToIndexedDB(config, fileState.loadedFilePath, fileState.loadedFileName).catch(() => {});
}

/**
 * Attempt to load display config from a URL.
 * Returns the config if found, null otherwise (doesn't throw on 404).
 */
/** The first display config found among `displayUrls`, tried in order; null when none is. */
export async function firstDisplayConfig(displayUrls: string[]): Promise<DisplayConfig | null> {
  for (const displayUrl of displayUrls) {
    const config = await loadDisplayConfigFromUrl(displayUrl);
    if (config) return config;
  }
  return null;
}


