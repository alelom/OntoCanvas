import type { ExternalOntologyReference } from './types';
import { getDisplayConfigKeyNormalized } from './configKey';

const IDB_EXTERNAL_REFS_NAME = 'OntologyEditorExternalRefs';
const IDB_EXTERNAL_REFS_STORE = 'refs';

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
