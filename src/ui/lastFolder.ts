/**
 * The last folder picked with the folder picker (#227), kept so it can be reopened on a later visit with one click. Only the
 * handle is kept (in IndexedDB, where a handle can be stored), never the files; the browser asks again whether the page may read
 * it. Chrome and Edge only: elsewhere there is no handle. Storage may be refused (a private window): then nothing is kept.
 */
import { debugWarn } from '../utils/debug';

const DATABASE = 'ontocanvas-folders';
const STORE = 'handles';
const KEY = 'last';

/** The permission calls of a directory handle, not in TypeScript's DOM types yet. */
interface PermissionHandle {
  name: string;
  queryPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>;
}

const listeners: Array<(handle: FileSystemDirectoryHandle) => void> = [];

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function rememberFolder(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.put(handle, KEY));
    listeners.forEach((listener) => listener(handle));
  } catch (error) {
    debugWarn('[lastFolder] could not keep the folder', error);
  }
}

export async function lastFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    return ((await withStore('readonly', (store) => store.get(KEY))) as FileSystemDirectoryHandle | undefined) ?? null;
  } catch (error) {
    debugWarn('[lastFolder] could not read the folder kept', error);
    return null;
  }
}

/** Called when another folder is kept: the Reopen buttons follow it. */
export function onFolderRemembered(listener: (handle: FileSystemDirectoryHandle) => void): void {
  listeners.push(listener);
}

/** Whether the page may read the folder now, asking the user when it may not yet. Must follow a click. */
export async function mayReadFolder(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const permission = handle as unknown as PermissionHandle;
  try {
    if ((await permission.queryPermission?.({ mode: 'read' })) === 'granted') return true;
    return (await permission.requestPermission?.({ mode: 'read' })) === 'granted';
  } catch (error) {
    // The folder was moved or deleted since.
    debugWarn('[lastFolder] could not ask to read the folder', error);
    return false;
  }
}
