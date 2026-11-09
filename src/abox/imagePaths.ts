/**
 * Values of the data that are paths to images (#228): `images/page-1/titleblock.png`, or an IRI ending in an image extension, and
 * where each one is. Pure: paths and addresses in, a path or an address out.
 *
 * Batch processes write the path relative to a folder of their own, not to the data file: a run writes
 * `runs/<run>/images/<page>/crop.png` next to `runs/<run>/part-0001.nq.gz`, relative to the folder above `runs/`. So a path is
 * looked for in a few places, and taken only when one file matches.
 */

const IMAGE_PATH = /\.(png|jpe?g|gif|webp|svg)$/i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** `C:\…` or `C:/…`: a path on a drive of a machine, not an address of the scheme `c:`. */
const DRIVE = /^[a-z]:[\\/]/i;

/** A path on a drive of a machine (`C:\data\a.png`). */
const isDrivePath = (value: string): boolean => DRIVE.test(value.trim());

/** An address (`https:`, `file:`, `urn:`), not a path; a Windows drive letter is a path. */
export const isAddress = (value: string): boolean => SCHEME.test(value.trim()) && !isDrivePath(value);

/**
 * A value naming an image by its extension. An address's query or fragment is cut first; a path is read whole, as a `#` or `?`
 * in a name is part of it (#240 review: `images/Issue #3/a.png`).
 */
export const isImagePath = (value: string): boolean => IMAGE_PATH.test((isAddress(value) ? value.split(/[?#]/)[0] : value).trim());

/** A part of a path decoded: every %XX, `&`, `#` and `,` too, as a batch run encodes them (Python's `quote`); a lone % stays. */
function decodePart(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part.replace(/%[0-9a-f]{2}/gi, (escape) => {
      try {
        return decodeURIComponent(escape);
      } catch {
        return escape;
      }
    });
  }
}

/**
 * The parts of a path: `\` read as `/`, each part decoded, `.` dropped and `..` applied (a `..` with nothing before it is
 * dropped). A `#` or `?` is part of a name, written plain or encoded: a path has no query or fragment.
 */
export function pathParts(value: string): string[] {
  const text = value.trim().replace(/\\/g, '/');
  const parts: string[] = [];
  for (const raw of text.split('/')) {
    const part = decodePart(raw);
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts;
}

/** A folder's image paths, indexed once for the many values looked up in it: the paths, and the paths by file name. */
export interface FolderIndex {
  paths: ReadonlySet<string>;
  byName: ReadonlyMap<string, readonly string[]>;
}

export function indexFolder(paths: Iterable<string>): FolderIndex {
  const set = new Set(paths);
  const byName = new Map<string, string[]>();
  for (const path of set) {
    const name = path.slice(path.lastIndexOf('/') + 1);
    byName.set(name, [...(byName.get(name) ?? []), path]);
  }
  return { paths: set, byName };
}

/**
 * The file of a folder an image path names, or null. `folder` is the folder's files, relative to it (or their index); `fromDir` is the folder of
 * the data file the value is in, relative to the same; `folderName` is the folder's own name. In this order:
 * 1. relative to the data file's own folder;
 * 2. relative to the folder;
 * 3. relative to a folder above the one opened: the value's first parts end with the folder's name (`runs/<run>/images/…` with
 *    `<run>` opened);
 * 4. relative to a folder inside the one opened: one file only ends with the value;
 * 5. for a path on a drive (`C:\data\run-0001\images\a.png`), when the folder's name is not in it: the longest file path it ends
 *    with.
 * A value that is an address (`https:`, `file:`) is not a path of the folder.
 */
export function findInFolder(value: string, folder: ReadonlySet<string> | FolderIndex, fromDir = '', folderName = ''): string | null {
  if (isAddress(value)) return null;
  const parts = pathParts(value);
  if (!parts.length) return null;
  const { paths, byName } = folder instanceof Set ? indexFolder(folder) : (folder as FolderIndex);
  const fromData = pathParts(`${fromDir}/${value}`).join('/');
  if (paths.has(fromData)) return fromData;
  const fromRoot = parts.join('/');
  if (paths.has(fromRoot)) return fromRoot;
  const at = folderName ? parts.lastIndexOf(folderName, parts.length - 2) : -1;
  if (at >= 0) {
    const below = parts.slice(at + 1).join('/');
    if (paths.has(below)) return below;
  }
  const sameName = byName.get(parts[parts.length - 1]) ?? [];
  const ending = sameName.filter((path) => path.endsWith(`/${fromRoot}`));
  if (ending.length === 1) return ending[0];
  if (!isDrivePath(value)) return null;
  const within = sameName.filter((path) => fromRoot.endsWith(`/${path}`)).sort((a, b) => b.length - a.length);
  return within[0] ?? null;
}

/**
 * The address of an image path in data read from `dataUrl` (#228): an http address is itself; a relative path is resolved
 * against the data file's folder, without the folders the two have in common (`runs/<run>/images/…` in
 * `…/runs/<run>/part-0001.nq.gz` is `…/runs/<run>/images/…`). A path starting with `../` goes up from the data file's folder,
 * as written. Null for any other address (`file:`, `urn:`), and for a path on a drive of a machine.
 */
export function resolveAgainstUrl(value: string, dataUrl: string): string | null {
  const text = value.trim();
  if (isDrivePath(text)) return null;
  if (SCHEME.test(text)) return /^https?:\/\//i.test(text) ? text : null;
  let base: URL;
  try {
    base = new URL('.', dataUrl);
  } catch {
    return null;
  }
  // The steps up a path starts with: pathParts has nothing to apply them to, so they are kept for the address (#240 review).
  const ups = /^(?:\.{1,2}[\\/])*/.exec(text)![0].split(/[\\/]/).filter((step) => step === '..').length;
  if (ups) {
    const rest = pathParts(text);
    return rest.length ? new URL('../'.repeat(ups) + rest.map(encodeURIComponent).join('/'), base).href : null;
  }
  const parts = pathParts(text);
  if (!parts.length) return null;
  const dir = base.pathname.split('/').filter(Boolean).map(decodePart);
  // Each part encoded again: a decoded `#` or `?` would start a fragment or a query.
  const address = (from: number) => new URL(parts.slice(from).map(encodeURIComponent).join('/'), base).href;
  for (let shared = Math.min(dir.length, parts.length - 1); shared > 0; shared--) {
    if (dir.slice(dir.length - shared).every((p, i) => p === parts[i])) return address(shared);
  }
  return address(0);
}
