/**
 * The versions of each ontology seen in this tab (#133): an older version cannot name the ones released after
 * it, so after switching to it the list would otherwise lose them. Kept in sessionStorage, by ontology IRI,
 * so a reload of the tab keeps them too.
 */
import { bareIri } from './ontologyVersion';
import type { VersionEntry } from './ontologyVersions';

const KEY_PREFIX = 'ontocanvas:seenVersions:';

/** The versions of the ontology `ontologyIri` seen earlier in this tab, with the address of each. */
export function recallSeenVersions(ontologyIri: string): VersionEntry[] {
  try {
    const stored = JSON.parse(sessionStorage.getItem(KEY_PREFIX + bareIri(ontologyIri)) ?? '[]') as unknown;
    return Array.isArray(stored) ? (stored as VersionEntry[]).filter((e) => typeof e?.version === 'string' && typeof e?.url === 'string') : [];
  } catch {
    return [];
  }
}

/** Remember the versions listed for `ontologyIri` (those with an address), with the ones seen before. */
export function rememberSeenVersions(ontologyIri: string, entries: readonly VersionEntry[]): void {
  const byUrl = new Map(recallSeenVersions(ontologyIri).map((e) => [e.url, e]));
  for (const e of entries) if (e.url) byUrl.set(e.url, { version: e.version, url: e.url, source: 'seen' });
  try {
    sessionStorage.setItem(KEY_PREFIX + bareIri(ontologyIri), JSON.stringify([...byUrl.values()]));
  } catch {
    // Storage full or blocked: the list is just shorter after a switch.
  }
}
