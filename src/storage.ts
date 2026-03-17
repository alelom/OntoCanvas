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

export type SerializerType = 'custom' | 'rdflib';

export interface SerializerConfig {
  serializerType: SerializerType;
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
  const key = getDisplayConfigKeyNormalized(filePath, fileName);
  if (!key) return [];
  try {
    const db = await openExternalRefsDB();
    const result = await new Promise<ExternalOntologyReference[]>((resolve) => {
      const tx = db.transaction(IDB_EXTERNAL_REFS_STORE, 'readonly');
      const store = tx.objectStore(IDB_EXTERNAL_REFS_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const v = req.result;
        resolve(Array.isArray(v) ? v : []);
      };
      req.onerror = () => resolve([]);
    });
    db.close();
    return result;
  } catch (err) {
    return [];
  }
}

export async function saveExternalRefsToIndexedDB(refs: ExternalOntologyReference[], filePath: string | null, fileName: string | null): Promise<void> {
  const key = getDisplayConfigKeyNormalized(filePath, fileName);
  if (!key) return;
  try {
    const db = await openExternalRefsDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_EXTERNAL_REFS_STORE, 'readwrite');
      const store = tx.objectStore(IDB_EXTERNAL_REFS_STORE);
      const req = store.put(refs, key);
      req.onsuccess = () => {
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch (err) {
    // Ignore errors
  }
}

export async function getLastFileFromIndexedDB(): Promise<{ handle: FileSystemFileHandle; pathHint?: string } | null> {
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
        resolve(v && v.handle ? { handle: v.handle, pathHint: v.pathHint } : null);
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
  pathHint?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put({ handle, pathHint }, IDB_KEY);
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

export async function getLastUrlFromIndexedDB(): Promise<{ url: string; name: string } | null> {
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

// ============================================================================
// Serializer Config IndexedDB Functions
// ============================================================================

const IDB_SERIALIZER_NAME = 'OntologyEditorSerializer';
const IDB_SERIALIZER_STORE = 'config';

async function openSerializerConfigDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_SERIALIZER_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_SERIALIZER_STORE)) {
        db.createObjectStore(IDB_SERIALIZER_STORE);
      }
    };
  });
}

export async function loadSerializerConfigFromIndexedDB(
  filePath: string | null,
  fileName: string | null
): Promise<SerializerConfig | null> {
  const key = getDisplayConfigKeyNormalized(filePath, fileName);
  if (!key) return null;
  
  try {
    const db = await openSerializerConfigDB();
    const result = await new Promise<SerializerConfig | null>((resolve) => {
      const tx = db.transaction(IDB_SERIALIZER_STORE, 'readonly');
      const store = tx.objectStore(IDB_SERIALIZER_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const v = req.result;
        resolve(v && typeof v === 'object' && v.serializerType ? v : null);
      };
      req.onerror = () => resolve(null);
    });
    db.close();
    return result;
  } catch (err) {
    console.warn('[loadSerializerConfigFromIndexedDB] Failed:', err);
    return null;
  }
}

export async function saveSerializerConfigToIndexedDB(
  config: SerializerConfig,
  filePath: string | null,
  fileName: string | null
): Promise<void> {
  const key = getDisplayConfigKeyNormalized(filePath, fileName);
  if (!key) return;
  
  try {
    const db = await openSerializerConfigDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_SERIALIZER_STORE, 'readwrite');
      const store = tx.objectStore(IDB_SERIALIZER_STORE);
      const req = store.put(config, key);
      req.onsuccess = () => {
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch (err) {
    console.warn('[saveSerializerConfigToIndexedDB] Failed:', err);
  }
}
