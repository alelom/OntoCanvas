import type { BorderLineType } from './types';

// IndexedDB database names and store names
const IDB_NAME = 'OntologyEditor';
const IDB_STORE = 'lastFile';
const IDB_KEY = 'handle';
const IDB_LAST_URL_KEY = 'lastUrl';
const IDB_DISPLAY_NAME = 'OntologyEditorDisplay';
const IDB_DISPLAY_STORE = 'config';
const IDB_EXTERNAL_REFS_NAME = 'OntologyEditorExternalRefs';
const IDB_EXTERNAL_REFS_STORE = 'refs';

/** How to position external ontology nodes relative to the graph. */
export type ExternalNodeLayout = 'auto' | 'right' | 'top' | 'bottom' | 'left';

export interface DisplayConfig {
  version: number;
  nodePositions: Record<string, { x: number; y: number }>;
  edgeStyleConfig: Record<string, { show: boolean; showLabel: boolean; color: string; lineType?: BorderLineType }>;
  wrapChars: number;
  minFontSize: number;
  maxFontSize: number;
  relationshipFontSize: number;
  dataPropertyFontSize?: number;
  layoutMode: string;
  searchQuery: string;
  includeNeighbors: boolean;
  annotationStyleConfig?: unknown;
  viewState?: { scale: number; position: { x: number; y: number } };
  /** Whether to show nodes from external ontologies (referenced by object property domain/range). */
  displayExternalReferences?: boolean;
  /** Layout of external nodes: auto (use main layout) or always place right/top/bottom/left of connected local node. */
  externalNodeLayout?: ExternalNodeLayout;
}

export interface ExternalOntologyReference {
  url: string;
  usePrefix: boolean;
  prefix?: string; // Optional prefix name (e.g., 'dc', 'schema')
  /** Opacity for imported classes and data properties from this ontology (0.1 to 1.0, default 0.5) */
  opacity?: number;
}

export const DISPLAY_CONFIG_VERSION = 1;

export function getDisplayConfigKey(filePath: string | null, fileName: string | null): string | null {
  return filePath || fileName || null;
}

/** Normalize to filename for consistent lookup across different load paths. */
export function getDisplayConfigKeyNormalized(filePath: string | null, fileName: string | null): string | null {
  const raw = getDisplayConfigKey(filePath, fileName);
  if (!raw) return null;
  const basename = raw.replace(/^.*[/\\]/, '');
  return basename || raw;
}

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
  } catch {
    // ignore
  }
  return null;
}

export async function saveDisplayConfigToIndexedDB(config: DisplayConfig, filePath: string | null, fileName: string | null): Promise<void> {
  const key = getDisplayConfigKeyNormalized(filePath, fileName) || getDisplayConfigKey(filePath, fileName);
  if (!key) return;
  try {
    const db = await openDisplayConfigDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_DISPLAY_STORE, 'readwrite');
      const store = tx.objectStore(IDB_DISPLAY_STORE);
      store.put({ ...config, version: DISPLAY_CONFIG_VERSION }, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // ignore
  }
}

export async function deleteDisplayConfigFromIndexedDB(filePath: string | null, fileName: string | null): Promise<void> {
  const keysToTry = [
    getDisplayConfigKeyNormalized(filePath, fileName),
    getDisplayConfigKey(filePath, fileName),
  ].filter((k): k is string => !!k);
  if (keysToTry.length === 0) return;
  try {
    const db = await openDisplayConfigDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_DISPLAY_STORE, 'readwrite');
      const store = tx.objectStore(IDB_DISPLAY_STORE);
      // Delete all possible key variants
      keysToTry.forEach((key) => {
        store.delete(key);
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // ignore
  }
}

async function openExternalRefsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_EXTERNAL_REFS_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_EXTERNAL_REFS_STORE)) {
        db.createObjectStore(IDB_EXTERNAL_REFS_STORE);
      }
    };
  });
}

export async function loadExternalRefsFromIndexedDB(filePath: string | null, fileName: string | null): Promise<ExternalOntologyReference[]> {
  const key = getDisplayConfigKeyNormalized(filePath, fileName) || getDisplayConfigKey(filePath, fileName);
  if (!key) return [];
  try {
    const db = await openExternalRefsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_EXTERNAL_REFS_STORE, 'readonly');
      const store = tx.objectStore(IDB_EXTERNAL_REFS_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as ExternalOntologyReference[]) || []);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return [];
  }
}

export async function saveExternalRefsToIndexedDB(refs: ExternalOntologyReference[], filePath: string | null, fileName: string | null): Promise<void> {
  const key = getDisplayConfigKeyNormalized(filePath, fileName) || getDisplayConfigKey(filePath, fileName);
  if (!key) return;
  try {
    const db = await openExternalRefsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_EXTERNAL_REFS_STORE, 'readwrite');
      const store = tx.objectStore(IDB_EXTERNAL_REFS_STORE);
      store.put(refs, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // ignore
  }
}

export async function getLastFileFromIndexedDB(): Promise<{
  handle: FileSystemFileHandle;
  name: string;
  pathHint?: string;
} | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.close();
        resolve(null);
        return;
      }
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const getReq = store.get(IDB_KEY);
      getReq.onsuccess = () => {
        const v = getReq.result;
        resolve(v && v.handle && v.name ? { handle: v.handle, name: v.name, pathHint: v.pathHint } : null);
      };
      getReq.onerror = () => resolve(null);
    };
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
  });
}

export async function saveLastFileToIndexedDB(
  handle: FileSystemFileHandle,
  name: string,
  pathHint?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put({ handle, name, pathHint }, IDB_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
  });
}

export async function getLastUrlFromIndexedDB(): Promise<{
  url: string;
  name: string;
} | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.close();
        resolve(null);
        return;
      }
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const getReq = store.get(IDB_LAST_URL_KEY);
      getReq.onsuccess = () => {
        const v = getReq.result;
        resolve(v && v.url && v.name ? { url: v.url, name: v.name } : null);
      };
      getReq.onerror = () => resolve(null);
    };
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
  });
}

export async function saveLastUrlToIndexedDB(
  url: string,
  name: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put({ url, name }, IDB_LAST_URL_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
  });
}
