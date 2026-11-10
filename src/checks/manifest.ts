/**
 * The files a library of checks is made of (#230, #231): SPARQL queries (`.rq`), SHACL shapes (Turtle), and a manifest (JSON)
 * that lists both by path. Pure: text in, plain objects out.
 *
 * A manifest lists each file by path, relative to the manifest, or as an object with a title and a description:
 *
 *   { "title": "…", "queries": ["queries/cq-1.rq", { "path": "queries/cq-2.rq", "title": "…", "description": "…" }],
 *     "shapes": ["shapes/readings.shacl.ttl"] }
 *
 * ADIRO's checks release is the example (https://w3id.org/adiro/checks/1.0.0/manifest.json): paths only, the title of each
 * query in its first comment.
 */

export type CheckFileKind = 'query' | 'shapes' | 'manifest';

export interface ManifestEntry {
  /** As written in the manifest. */
  path: string;
  title?: string;
  description?: string;
}

export interface Manifest {
  title?: string;
  queries: ManifestEntry[];
  shapes: ManifestEntry[];
}

const QUERY_EXTENSIONS = ['.rq', '.sparql'];
/** Read with N3's parser: Turtle and its relatives. */
const SHAPES_EXTENSIONS = ['.ttl', '.turtle', '.shacl', '.nt', '.trig'];

/** What a file is, by its name: a query, shapes, a manifest; null for anything else. */
export function checkFileKind(name: string): CheckFileKind | null {
  const lower = name.toLowerCase().replace(/[?#].*$/, '');
  if (QUERY_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'query';
  if (lower.endsWith('.json')) return 'manifest';
  if (SHAPES_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'shapes';
  return null;
}

/** The last part of a path or an address, without a query string. */
export const fileName = (path: string): string => {
  const clean = path.replace(/[?#].*$/, '').replace(/\/+$/, '');
  return clean.slice(clean.lastIndexOf('/') + 1);
};

function entries(value: unknown, field: string): ManifestEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`The manifest's "${field}" is not a list.`);
  return value.map((item, i) => {
    if (typeof item === 'string' && item.trim()) return { path: item.trim() };
    if (item && typeof item === 'object' && typeof (item as { path?: unknown }).path === 'string') {
      const { path, title, description } = item as { path: string; title?: unknown; description?: unknown };
      return {
        path: path.trim(),
        ...(typeof title === 'string' && title.trim() ? { title: title.trim() } : {}),
        ...(typeof description === 'string' && description.trim() ? { description: description.trim() } : {}),
      };
    }
    throw new Error(`Item ${i + 1} of the manifest's "${field}" is neither a path nor an object with a "path".`);
  });
}

/** Reads a manifest. Throws with a reason a reader can act on when it is not one. */
export function parseManifest(text: string): Manifest {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('The manifest is not valid JSON.');
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('The manifest is not a JSON object.');
  const object = json as Record<string, unknown>;
  const queries = entries(object.queries, 'queries');
  const shapes = entries(object.shapes, 'shapes');
  if (!queries.length && !shapes.length) throw new Error('The manifest lists no "queries" and no "shapes".');
  const title = [object.title, object.artefact, object.name].find((t): t is string => typeof t === 'string' && t.trim() !== '');
  return { ...(title ? { title: title.trim() } : {}), queries, shapes };
}

/**
 * The title of a query: its first comment, as ADIRO's queries carry ("# CQ 2.4: the drawings filed under another project…");
 * else the file's name without its extension.
 */
export function queryTitle(text: string, name: string): string {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^(PREFIX|BASE)\s/i.test(trimmed)) continue;
    if (!trimmed.startsWith('#')) break;
    const comment = trimmed.replace(/^#+\s*/, '');
    if (comment) return comment;
  }
  return fileName(name).replace(/\.[^.]+$/, '');
}

/** A path of a manifest against the manifest's address, or against its path among files picked from a folder. */
export function resolvePath(path: string, base: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  if (/^[a-z][a-z0-9+.-]*:/i.test(base)) return new URL(path, base).href;
  // A path inside a picked folder: resolved by hand, as there is no address to resolve against.
  const parts = base.split('/').slice(0, -1);
  for (const part of path.split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}
