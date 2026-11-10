/**
 * The library of checks of the session (#230, #231): saved SPARQL queries for the Query tab, and SHACL shapes for the Checks tab.
 * Loaded from an address, from files, or from a folder; a manifest among them lists both. Kept for the session: opening another
 * ontology keeps it, as the checks of a domain apply to all of its files.
 */
import { Parser, Store } from 'n3';
import { checkFileKind, fileName, parseManifest, queryTitle, resolvePath, type ManifestEntry } from './manifest';
import { shapesToRun } from './validateShapes';

export interface SavedQuery {
  /** Where it was read from: its address, or its path among the files picked. Loading it again replaces it. */
  source: string;
  title: string;
  description?: string;
  text: string;
  /** The manifest it came with (its title), or null for a file loaded on its own. */
  group: string | null;
}

export interface ShapesFile {
  source: string;
  name: string;
  store: Store;
  /** The prefixes it declares: the report names its shapes with them. */
  prefixes: Record<string, string>;
  /** How many shapes in it are run (those with a target). */
  shapeCount: number;
  group: string | null;
}

export interface LoadOutcome {
  queries: number;
  shapes: number;
  /** What could not be read, one line each, naming the file. */
  problems: string[];
}

/** A file the browser gives, by its path from the folder picked (or its name). */
export interface PickedFile {
  path: string;
  text(): Promise<string>;
}

export interface ChecksLibrary {
  queries(): SavedQuery[];
  shapesFiles(): ShapesFile[];
  /** Every shape loaded, as one store to validate with. */
  shapes(): Store;
  /** The prefixes the shapes files declare, the first declaration of a prefix kept. */
  shapesPrefixes(): Record<string, string>;
  addUrl(url: string): Promise<LoadOutcome>;
  /** Files picked one by one; or, with `folder`, every file of a folder, of which only the checks are kept. */
  addFiles(files: PickedFile[], options?: { folder?: boolean }): Promise<LoadOutcome>;
  removeShapes(source: string): void;
  clearQueries(): void;
  onChange(listener: () => void): void;
}

export interface ChecksLibraryDeps {
  /** Reads an address as text. Defaults to fetch, with a reason a reader can act on when it fails. */
  fetchText?: (url: string) => Promise<string>;
}

async function fetchText(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error('it could not be fetched (offline, or the server does not allow other sites to read it)');
  }
  if (!response.ok) throw new Error(`the server answered ${response.status}`);
  return response.text();
}

/** In a folder with no manifest, the files that are shapes by their name: a folder of data holds Turtle that is not. */
const looksLikeShapes = (path: string): boolean => /(\.shacl\.|shapes?[^/]*\.[^/]+$)/i.test(fileName(path));

const problemOf = (source: string, error: unknown): string => `${fileName(source) || source}: ${error instanceof Error ? error.message : String(error)}`;

export function createChecksLibrary(deps: ChecksLibraryDeps = {}): ChecksLibrary {
  const read = deps.fetchText ?? fetchText;
  let queries: SavedQuery[] = [];
  let shapesFiles: ShapesFile[] = [];
  let merged: Store | null = null;
  const listeners: (() => void)[] = [];
  const changed = (): void => {
    merged = null;
    listeners.forEach((listener) => listener());
  };

  /** A file of the library, read: added, or replacing the one read from the same place. */
  function take(kind: 'query' | 'shapes', source: string, text: string, entry: Partial<ManifestEntry>, group: string | null): void {
    if (kind === 'query') {
      const query: SavedQuery = {
        source,
        title: entry.title ?? queryTitle(text, source),
        ...(entry.description ? { description: entry.description } : {}),
        text,
        group,
      };
      queries = [...queries.filter((q) => q.source !== source), query];
      return;
    }
    let store: Store;
    const prefixes: Record<string, string> = {};
    try {
      const parser = new Parser({ baseIRI: /^[a-z][a-z0-9+.-]*:/i.test(source) ? source : undefined });
      store = new Store(parser.parse(text, null, (prefix, iri) => (prefixes[prefix] = iri.value)));
    } catch (error) {
      throw new Error(`not readable as Turtle (${error instanceof Error ? error.message : String(error)})`);
    }
    const shapeCount = shapesToRun(store).length;
    if (shapeCount === 0) throw new Error('it holds no SHACL shape with a target');
    shapesFiles = [...shapesFiles.filter((s) => s.source !== source), { source, name: fileName(source), store, prefixes, shapeCount, group }];
  }

  /** Reads the files a manifest lists, with `get` reading one by its resolved path. */
  async function fromManifest(text: string, base: string, get: (path: string) => Promise<string>, outcome: LoadOutcome): Promise<Set<string>> {
    const manifest = parseManifest(text);
    const group = manifest.title ?? fileName(base);
    const listed = new Set<string>();
    const jobs = [
      ...manifest.queries.map((entry) => ({ kind: 'query' as const, entry })),
      ...manifest.shapes.map((entry) => ({ kind: 'shapes' as const, entry })),
    ];
    // Read together, kept in the manifest's order.
    const texts = await Promise.allSettled(jobs.map(({ entry }) => get(resolvePath(entry.path, base))));
    jobs.forEach(({ kind, entry }, i) => {
      const source = resolvePath(entry.path, base);
      listed.add(source);
      const result = texts[i];
      try {
        if (result.status === 'rejected') throw result.reason;
        take(kind, source, result.value, entry, group);
        outcome[kind === 'query' ? 'queries' : 'shapes']++;
      } catch (error) {
        outcome.problems.push(problemOf(entry.path, error));
      }
    });
    return listed;
  }

  return {
    queries: () => queries,
    shapesFiles: () => shapesFiles,
    shapesPrefixes: () => Object.assign({}, ...[...shapesFiles].reverse().map((file) => file.prefixes)),
    shapes() {
      if (!merged) {
        merged = new Store();
        for (const file of shapesFiles) merged.addQuads(file.store.getQuads(null, null, null, null));
      }
      return merged;
    },

    async addUrl(url) {
      const outcome: LoadOutcome = { queries: 0, shapes: 0, problems: [] };
      const kind = checkFileKind(url) ?? 'manifest';
      try {
        const text = await read(url);
        if (kind === 'manifest') await fromManifest(text, url, read, outcome);
        else {
          take(kind, url, text, {}, null);
          outcome[kind === 'query' ? 'queries' : 'shapes']++;
        }
      } catch (error) {
        outcome.problems.push(problemOf(url, error));
      }
      changed();
      return outcome;
    },

    async addFiles(files, { folder = false } = {}) {
      const outcome: LoadOutcome = { queries: 0, shapes: 0, problems: [] };
      const byPath = new Map(files.map((file) => [file.path, file]));
      // Files picked one by one have no folder: a manifest's path finds them by their name.
      const byName = new Map(files.map((file) => [fileName(file.path), file]));
      const listed = new Set<string>();
      const used = new Set<PickedFile>();
      // A manifest lists its files: they come with its titles, and in a folder only they are taken.
      const manifests = files.filter((file) => checkFileKind(file.path) === 'manifest');
      for (const manifest of manifests) {
        const get = async (path: string): Promise<string> => {
          const file = byPath.get(path) ?? (folder ? undefined : byName.get(fileName(path)));
          if (!file) throw new Error(folder ? 'not in the folder' : 'not among the files picked: pick the folder, or the files with the manifest');
          used.add(file);
          return file.text();
        };
        try {
          for (const path of await fromManifest(await manifest.text(), manifest.path, get, outcome)) listed.add(path);
        } catch (error) {
          outcome.problems.push(problemOf(manifest.path, error));
        }
      }
      for (const file of files) {
        const kind = checkFileKind(file.path);
        if (!kind || kind === 'manifest' || listed.has(file.path) || used.has(file)) continue;
        if (folder && (manifests.length || (kind === 'shapes' && !looksLikeShapes(file.path)))) continue;
        try {
          take(kind, file.path, await file.text(), {}, null);
          outcome[kind === 'query' ? 'queries' : 'shapes']++;
        } catch (error) {
          outcome.problems.push(problemOf(file.path, error));
        }
      }
      if (!folder && files.some((file) => !checkFileKind(file.path))) {
        for (const file of files.filter((f) => !checkFileKind(f.path))) outcome.problems.push(`${fileName(file.path)}: not a query (.rq), shapes (Turtle) or a manifest (.json)`);
      }
      changed();
      return outcome;
    },

    removeShapes(source) {
      shapesFiles = shapesFiles.filter((file) => file.source !== source);
      changed();
    },
    clearQueries() {
      queries = [];
      changed();
    },
    onChange: (listener) => void listeners.push(listener),
  };
}

/** What a load did, in one line: "3 queries and 2 shape files loaded", and the first problem. */
export function describeOutcome(outcome: LoadOutcome): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const loaded = [outcome.queries ? plural(outcome.queries, 'query', 'queries') : '', outcome.shapes ? plural(outcome.shapes, 'shapes file', 'shapes files') : '']
    .filter(Boolean)
    .join(' and ');
  const said = loaded ? `${loaded} loaded.` : 'Nothing was loaded.';
  if (!outcome.problems.length) return said;
  return `${said} ${plural(outcome.problems.length, 'file', 'files')} could not be read: ${outcome.problems[0]}${outcome.problems.length > 1 ? ' …' : ''}`;
}
