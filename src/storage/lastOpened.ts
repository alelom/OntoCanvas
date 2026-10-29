// IndexedDB database names and store names
const IDB_NAME = 'OntologyEditor';
const IDB_STORE = 'lastFile';
const IDB_KEY = 'handle';
const IDB_LAST_URL_KEY = 'lastUrl';

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
// Recently Opened Ontologies (history, most-recent-first)
// ============================================================================

const IDB_RECENT_KEY = 'recentlyOpened';
export const MAX_RECENTLY_OPENED = 5;

export type RecentlyOpenedEntry =
  | { kind: 'file'; handle: FileSystemFileHandle; pathHint?: string; name: string; openedAt: number }
  | { kind: 'url'; url: string; name: string; openedAt: number };

function recentlyOpenedKey(entry: RecentlyOpenedEntry): string {
  return entry.kind === 'url' ? `url:${entry.url}` : `file:${entry.pathHint ?? entry.name}`;
}

export async function getRecentlyOpenedFromIndexedDB(): Promise<RecentlyOpenedEntry[]> {
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.close();
        resolve([]);
        return;
      }
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const getReq = store.get(IDB_RECENT_KEY);
      getReq.onsuccess = () => {
        const v = getReq.result;
        resolve(Array.isArray(v) ? v : []);
      };
      getReq.onerror = () => resolve([]);
    };
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
  });
}

/** Record an ontology as opened: prepends to the history, deduping any earlier entry for the same file/URL, capped to MAX_RECENTLY_OPENED. */
export async function addRecentlyOpenedToIndexedDB(entry: RecentlyOpenedEntry): Promise<void> {
  const existing = await getRecentlyOpenedFromIndexedDB();
  const key = recentlyOpenedKey(entry);
  const deduped = existing.filter((e) => recentlyOpenedKey(e) !== key);
  const updated = [entry, ...deduped].slice(0, MAX_RECENTLY_OPENED);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(updated, IDB_RECENT_KEY);
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
