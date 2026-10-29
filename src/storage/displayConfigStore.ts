import type { DisplayConfig } from './types';
import { getDisplayConfigKey, getDisplayConfigKeyNormalized } from './configKey';

const IDB_DISPLAY_NAME = 'OntologyEditorDisplay';
const IDB_DISPLAY_STORE = 'config';

export const DISPLAY_CONFIG_VERSION = 1;

async function openDisplayConfigDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DISPLAY_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_DISPLAY_STORE)) {
        db.createObjectStore(IDB_DISPLAY_STORE);
      }
    };
  });
}

export async function loadDisplayConfigFromIndexedDB(filePath: string | null, fileName: string | null): Promise<DisplayConfig | null> {
  const keysToTry = [
    getDisplayConfigKeyNormalized(filePath, fileName),
    getDisplayConfigKey(filePath, fileName),
  ].filter((k): k is string => !!k);
  const seen = new Set<string>();
  const uniqueKeys = keysToTry.filter((k) => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (uniqueKeys.length === 0) return null;
  try {
    const db = await openDisplayConfigDB();
    for (const key of uniqueKeys) {
      const result = await new Promise<DisplayConfig | null>((resolve) => {
        const tx = db.transaction(IDB_DISPLAY_STORE, 'readonly');
        const store = tx.objectStore(IDB_DISPLAY_STORE);
        const req = store.get(key);
        req.onsuccess = () => {
          const v = req.result;
          resolve(v && typeof v === 'object' && v.version === DISPLAY_CONFIG_VERSION ? v : null);
        };
        req.onerror = () => resolve(null);
      });
      if (result) {
        db.close();
        return result;
      }
    }
    db.close();
    return null;
  } catch (err) {
    return null;
  }
}

export async function saveDisplayConfigToIndexedDB(config: DisplayConfig, filePath: string | null, fileName: string | null): Promise<void> {
  const keysToTry = [
    getDisplayConfigKeyNormalized(filePath, fileName),
    getDisplayConfigKey(filePath, fileName),
  ].filter((k): k is string => !!k);
  const seen = new Set<string>();
  const uniqueKeys = keysToTry.filter((k) => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (uniqueKeys.length === 0) return;
  try {
    const db = await openDisplayConfigDB();
    for (const key of uniqueKeys) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_DISPLAY_STORE, 'readwrite');
        const store = tx.objectStore(IDB_DISPLAY_STORE);
        const req = store.put(config, key);
        req.onsuccess = () => {
          resolve();
        };
        req.onerror = () => reject(req.error);
      });
    }
    db.close();
  } catch (err) {
    // Ignore errors
  }
}

export async function deleteDisplayConfigFromIndexedDB(filePath: string | null, fileName: string | null): Promise<void> {
  const keysToTry = [
    getDisplayConfigKeyNormalized(filePath, fileName),
    getDisplayConfigKey(filePath, fileName),
  ].filter((k): k is string => !!k);
  const seen = new Set<string>();
  const uniqueKeys = keysToTry.filter((k) => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (uniqueKeys.length === 0) return;
  try {
    const db = await openDisplayConfigDB();
    for (const key of uniqueKeys) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_DISPLAY_STORE, 'readwrite');
        const store = tx.objectStore(IDB_DISPLAY_STORE);
        const req = store.delete(key);
        req.onsuccess = () => {
          resolve();
        };
        req.onerror = () => reject(req.error);
      });
    }
    db.close();
  } catch (err) {
    // Ignore errors
  }
}
