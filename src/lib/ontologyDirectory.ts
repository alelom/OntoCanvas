/**
 * The folder of the open ontology, where "Open external ontology" looks for an imported ontology's file
 * before opening it by URL (#103). Browsers don't say which folder an opened file came from
 * (FileSystemFileHandle.getParent() isn't implemented in Chromium, and the file input gives no handle), so
 * the user is asked once with showDirectoryPicker() and the folder is remembered until another ontology is
 * opened. Browsers without the picker (Firefox, Safari) get null: the caller opens the URL instead.
 */

type WithGetParent = FileSystemFileHandle & { getParent?: () => Promise<FileSystemDirectoryHandle> };
type WithDirectoryPicker = { showDirectoryPicker?: (opts?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle> };

let remembered: FileSystemDirectoryHandle | null = null;

/** Forget the folder, when another ontology is opened. */
export function forgetOntologyDirectory(): void {
  remembered = null;
}

/** The open ontology's folder: its own parent where the browser provides it, else the remembered one, else
 * ask the user (once). Null when the user cancels or the browser can't ask. */
export async function getOrRequestOntologyDirectory(fileHandle: FileSystemFileHandle | null): Promise<FileSystemDirectoryHandle | null> {
  const getParent = (fileHandle as WithGetParent | null)?.getParent;
  if (typeof getParent === 'function') {
    try {
      return await getParent.call(fileHandle);
    } catch {
      // Fall back to asking.
    }
  }
  if (remembered) return remembered;
  const picker = (globalThis as WithDirectoryPicker).showDirectoryPicker;
  if (typeof picker !== 'function') return null;
  try {
    remembered = await picker({ id: 'ontocanvas-ontology-folder', mode: 'read' });
    return remembered;
  } catch {
    return null; // cancelled
  }
}
