/**
 * Module for storing and retrieving local file content in IndexedDB using tokens.
 * This allows sharing file content between tabs without CORS issues.
 */

const IDB_NAME = 'OntologyEditorLocalFiles';
const IDB_STORE = 'files';
const TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export interface LocalFileData {
  content: string;
  fileName: string;
  pathHint: string;
  timestamp: number;
}

/**
 * Generate a unique token for storing file content.
 */
function generateToken(): string {
  return `local-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Open the IndexedDB database for local file storage.
 */
async function openLocalFilesDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
  });
}

/**
 * Store file content in IndexedDB and return a token.
 * The token can be used to retrieve the file content in a new tab.
 * 
 * @param content - The file content to store
 * @param fileName - The file name
 * @param pathHint - The path hint (for display)
 * @returns A token that can be used to retrieve the file content
 */
export async function storeLocalFileContent(
  content: string,
  fileName: string,
  pathHint: string
): Promise<string> {
  const token = generateToken();
  const data: LocalFileData = {
    content,
    fileName,
    pathHint,
    timestamp: Date.now(),
  };

  try {
    const db = await openLocalFilesDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(data, token);
      tx.oncomplete = () => {
        db.close();
        resolve(token);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    throw new Error(`Failed to store local file content: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Retrieve file content from IndexedDB using a token.
 * Returns null if the token is invalid or expired.
 * 
 * @param token - The token to retrieve the file content
 * @returns The file data, or null if not found or expired
 */
export async function retrieveLocalFileContent(token: string): Promise<LocalFileData | null> {
  try {
    const db = await openLocalFilesDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(token);
      req.onsuccess = () => {
        const data = req.result as LocalFileData | undefined;
        db.close();
        
        if (!data) {
          resolve(null);
          return;
        }
        
        // Check if token has expired
        const age = Date.now() - data.timestamp;
        if (age > TOKEN_EXPIRY_MS) {
          // Token expired, delete it
          deleteLocalFileContent(token).catch(() => {});
          resolve(null);
          return;
        }
        
        resolve(data);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

/**
 * Delete file content from IndexedDB using a token.
 * 
 * @param token - The token to delete
 */
export async function deleteLocalFileContent(token: string): Promise<void> {
  try {
    const db = await openLocalFilesDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.delete(token);
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
    // Silently fail if deletion fails
  }
}

/**
 * Clean up expired tokens from IndexedDB.
 * This should be called periodically to prevent IndexedDB from growing too large.
 */
export async function cleanupExpiredTokens(): Promise<void> {
  try {
    const db = await openLocalFilesDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.openCursor();
      
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const data = cursor.value as LocalFileData;
          const age = Date.now() - data.timestamp;
          if (age > TOKEN_EXPIRY_MS) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          db.close();
          resolve();
        }
      };
      
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    // Silently fail if cleanup fails
  }
}
