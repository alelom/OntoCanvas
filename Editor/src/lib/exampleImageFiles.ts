/**
 * File system helpers for example images: directory handle, write image, safe filename, open image.
 * Uses File System Access API; showDirectoryPicker when getParent is not available.
 */

let cachedDirHandle: FileSystemDirectoryHandle | null = null;

/**
 * Get or request the directory where example images should be saved.
 * Tries fileHandle.getParent() if available, otherwise showDirectoryPicker.
 * Caches the result for the session.
 */
export async function getOrRequestImageDirectory(
  fileHandle: FileSystemFileHandle | null
): Promise<FileSystemDirectoryHandle | null> {
  if (cachedDirHandle) return cachedDirHandle;
  if (fileHandle && 'getParent' in fileHandle && typeof (fileHandle as FileSystemFileHandle & { getParent?: () => Promise<FileSystemDirectoryHandle> }).getParent === 'function') {
    try {
      const parent = await (fileHandle as FileSystemFileHandle & { getParent: () => Promise<FileSystemDirectoryHandle> }).getParent();
      cachedDirHandle = parent;
      return parent;
    } catch {
      // fall through to picker
    }
  }
  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    try {
      const dir = await (window as Window & { showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({
        mode: 'readwrite',
      });
      cachedDirHandle = dir;
      return dir;
    } catch {
      return null; // user cancelled or error
    }
  }
  return null;
}

/**
 * Clear cached directory handle (e.g. when opening a new file from URL).
 */
/** Return the cached directory handle (e.g. for opening relative image URIs). */
export function getCachedImageDirectory(): FileSystemDirectoryHandle | null {
  return cachedDirHandle;
}

export function clearCachedImageDirectory(): void {
  cachedDirHandle = null;
}

/**
 * Write a blob to a relative path under the given directory (e.g. img/FireDoor_1.png).
 * Creates the img subfolder if needed.
 */
export async function writeExampleImageFile(
  dirHandle: FileSystemDirectoryHandle,
  relativePath: string,
  blob: Blob
): Promise<void> {
  const parts = relativePath.split('/').filter(Boolean);
  let current: FileSystemDirectoryHandle = dirHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i], { create: true });
  }
  const fileName = parts[parts.length - 1];
  const fileHandle = await current.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

/**
 * Return a unique relative path for an example image (e.g. img/FireDoor_1.png).
 * Sanitizes class name and optional original name; avoids collisions with existingUris.
 */
export function getSafeExampleImageFileName(
  classLocalName: string,
  existingUris: string[],
  originalName?: string
): string {
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_') || 'image';
  const base = sanitize(classLocalName);
  let ext = 'png';
  if (originalName) {
    const m = originalName.match(IMAGE_EXT_RE);
    if (m) ext = m[1].toLowerCase().replace('jpeg', 'jpg');
  }
  const pathKey = (u: string): string => {
    const trimmed = u.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        const p = new URL(trimmed).pathname.replace(/^\//, '');
        const i = p.indexOf('img/');
        return i >= 0 ? p.slice(i) : p;
      } catch {
        return u;
      }
    }
    return u;
  };
  const existingPaths = new Set(existingUris.map(pathKey));
  let index = 0;
  let candidate: string;
  do {
    candidate = `img/${base}${index ? `_${index}` : ''}.${ext}`;
    index++;
  } while (existingPaths.has(candidate) && index < 10000);
  return candidate;
}

/**
 * Open an example image URI: if http(s) open in new tab; if relative and dirHandle set, resolve file and open object URL in new tab.
 */
export function openExampleImageUri(uri: string, dirHandle: FileSystemDirectoryHandle | null): void {
  const trimmed = uri.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    window.open(trimmed, '_blank', 'noopener');
    return;
  }
  if (!dirHandle) return;
  (async () => {
    try {
      const parts = trimmed.split('/').filter(Boolean);
      let current: FileSystemDirectoryHandle | FileSystemFileHandle = dirHandle;
      for (let i = 0; i < parts.length; i++) {
        if (i === parts.length - 1) {
          const f = await (current as FileSystemDirectoryHandle).getFileHandle(parts[i]);
          const file = await f.getFile();
          const url = URL.createObjectURL(file);
          window.open(url, '_blank', 'noopener');
          // Defer revoke so the new tab has time to fetch the blob; revoking immediately can cause a blank/error page
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        } else {
          current = await (current as FileSystemDirectoryHandle).getDirectoryHandle(parts[i]);
        }
      }
    } catch {
      // open as literal URI in new tab as fallback (may 404)
      window.open(trimmed, '_blank', 'noopener');
    }
  })();
}
