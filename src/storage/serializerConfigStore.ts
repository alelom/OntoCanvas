import type { SerializerConfig } from './types';
import { getDisplayConfigKeyNormalized } from './configKey';


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
