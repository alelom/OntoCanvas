/**
 * The history of the queries run on a file (#182): recorded when a query is run, kept per ontology in the browser's local
 * storage (bounded), and offered again in a selector above the editor. Local storage can be missing or throw (a private window,
 * blocked site data, a full disk), so nothing here may fail because of it: without storage the history lasts for the session.
 */
import type { Store } from 'n3';

export interface HistoryEntry {
  query: string;
  /** When it was run, as `Date.now()`. */
  at: number;
}

/** How many queries are kept for a file. */
export const HISTORY_LIMIT = 30;
/** The longest query written to the storage; a longer one is kept for the session only. */
export const MAX_STORED_QUERY = 20_000;
/** How many files have a history; the one used longest ago is forgotten first, so the storage cannot grow without end. */
export const HISTORY_FILES = 50;

const STORAGE_KEY = 'ontocanvas.sparqlHistory.v1';
const LABEL_LENGTH = 60;

/**
 * `entries` (newest first) with `query` added at the front. A blank query, and a repeat of the query run last, are not
 * recorded; the same text run again after another query is. Keeps at most `limit` entries. Does not change `entries`.
 */
export function addToHistory(entries: HistoryEntry[], query: string, at: number, limit = HISTORY_LIMIT): HistoryEntry[] {
  if (!query.trim()) return entries;
  if (entries[0]?.query === query) return entries;
  return [{ query, at }, ...entries].slice(0, limit);
}

export interface HistoryStore {
  load(key: string): HistoryEntry[];
  save(key: string, entries: HistoryEntry[]): void;
  clear(key: string): void;
}

interface Stored {
  files: Record<string, { at: number; entries: HistoryEntry[] }>;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

const isEntry = (value: unknown): value is HistoryEntry =>
  !!value && typeof value === 'object' && typeof (value as HistoryEntry).query === 'string' && typeof (value as HistoryEntry).at === 'number';

/** What is stored, keeping only what can be used: stored text of another shape, or damaged, reads as an empty history. */
function readAll(storage: StorageLike): Stored {
  const empty: Stored = { files: {} };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed: unknown = JSON.parse(raw);
    const files = parsed && typeof parsed === 'object' ? (parsed as { files?: unknown }).files : null;
    if (!files || typeof files !== 'object') return empty;
    const result: Stored = { files: {} };
    for (const [key, value] of Object.entries(files)) {
      const entries = value && typeof value === 'object' ? (value as { entries?: unknown }).entries : null;
      if (!Array.isArray(entries)) continue;
      const at = (value as { at?: unknown }).at;
      result.files[key] = { at: typeof at === 'number' ? at : 0, entries: entries.filter(isEntry) };
    }
    return result;
  } catch {
    return empty;
  }
}

/** The history in local storage, or in a storage given for a test; `null` for no storage at all (the history then lasts for the session). */
export function localStorageHistory(storage: StorageLike | null | undefined = undefined): HistoryStore {
  const target = storage === undefined ? defaultStorage() : storage;
  /** What this session saved. It is what `load` gives for a file whose storage is not the whole truth (see `needsMemory`). */
  const session = new Map<string, HistoryEntry[]>();
  /** Files whose list is not in the storage in full: there is no storage, a write failed, or a query was too large to keep there. */
  const needsMemory = new Set<string>();

  const save = (key: string, entries: HistoryEntry[]): void => {
    const kept = entries.slice(0, HISTORY_LIMIT);
    session.set(key, kept);
    // A very large pasted query would make every later write fail until 30 newer ones pushed it out: it stays in this session only.
    const storable = kept.filter((entry) => entry.query.length <= MAX_STORED_QUERY);
    if (storable.length < kept.length) needsMemory.add(key);
    else needsMemory.delete(key);
    if (!target) {
      needsMemory.add(key);
      return;
    }
    const all = readAll(target);
    if (storable.length === 0) delete all.files[key];
    else all.files[key] = { at: Date.now(), entries: storable };
    const keys = Object.keys(all.files);
    if (keys.length > HISTORY_FILES) {
      keys.sort((a, b) => all.files[a].at - all.files[b].at);
      for (const old of keys.slice(0, keys.length - HISTORY_FILES)) delete all.files[old];
    }
    try {
      target.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // A full or blocked storage: the history of this visit stays in memory only.
      needsMemory.add(key);
    }
  };

  return {
    load: (key) => (needsMemory.has(key) ? session.get(key) ?? [] : target ? readAll(target).files[key]?.entries ?? [] : []),
    save,
    clear: (key) => save(key, []),
  };
}

const OWL_ONTOLOGY = 'http://www.w3.org/2002/07/owl#Ontology';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

/**
 * What a file's history is kept under: the ontology's own IRI, so the same ontology opened from another place has the same
 * history, or the name of the file when it declares no ontology IRI. Null when neither is known (nothing is then recorded).
 */
export function historyKeyOf(store: Store | null, fileName: string | null): string | null {
  const ontology = store?.getQuads(null, RDF_TYPE, OWL_ONTOLOGY, null).find((q) => q.subject.termType === 'NamedNode');
  if (ontology) return `ontology:${ontology.subject.value}`;
  return fileName ? `file:${fileName}` : null;
}

/** A leading PREFIX or BASE declaration, with the comments and blank space before it. */
const LEADING_DECLARATION = /^(?:\s|#[^\n]*)*(?:PREFIX\s+[\w.-]*:\s*<[^>]*>|BASE\s+<[^>]*>)/i;

/** The first line of a query that says what it asks: after its PREFIX and BASE declarations (which may share a line) and comments. */
function firstMeaningfulLine(query: string): string {
  let rest = query;
  for (let match = LEADING_DECLARATION.exec(rest); match; match = LEADING_DECLARATION.exec(rest)) rest = rest.slice(match[0].length);
  const lines = rest.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const own = lines[0] ?? query.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return own.replace(/\s+/g, ' ');
}

/** "14:05  SELECT ?c WHERE { ... }": the time of day (with the date when it was not today) and what the query asks, shortened. */
export function historyLabel(entry: HistoryEntry, now = Date.now(), locale?: string): string {
  const when = new Date(entry.at);
  const today = new Date(now);
  const time = when.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const sameDay = when.getFullYear() === today.getFullYear() && when.getMonth() === today.getMonth() && when.getDate() === today.getDate();
  const stamp = sameDay ? time : `${when.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}, ${time}`;
  const line = firstMeaningfulLine(entry.query);
  return `${stamp}  ${line.length > LABEL_LENGTH ? `${line.slice(0, LABEL_LENGTH)}…` : line}`;
}
