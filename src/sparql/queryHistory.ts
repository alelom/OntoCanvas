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

/** The history in local storage, or in a storage given for a test; `null` for no storage at all (everything is then a no-op). */
export function localStorageHistory(storage: StorageLike | null | undefined = undefined): HistoryStore {
  const target = storage === undefined ? defaultStorage() : storage;

  const save = (key: string, entries: HistoryEntry[]): void => {
    if (!target) return;
    const all = readAll(target);
    if (entries.length === 0) delete all.files[key];
    else all.files[key] = { at: Date.now(), entries: entries.slice(0, HISTORY_LIMIT) };
    const keys = Object.keys(all.files);
    if (keys.length > HISTORY_FILES) {
      keys.sort((a, b) => all.files[a].at - all.files[b].at);
      for (const old of keys.slice(0, keys.length - HISTORY_FILES)) delete all.files[old];
    }
    try {
      target.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // A full or blocked storage: the history of this visit stays in memory only.
    }
  };

  return {
    load: (key) => (target ? readAll(target).files[key]?.entries ?? [] : []),
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
