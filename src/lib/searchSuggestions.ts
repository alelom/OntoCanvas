/**
 * Search-bar suggestions (#81): relationships, classes and data properties, each shown by its prefixed
 * name (e.g. `foaf:member` rather than `http://xmlns.com/foaf/0.1/member`) with the full IRI as a tooltip.
 * Pure, so it can be unit-tested; main.ts gathers the sources and renders the list.
 */

/** What kind of term a suggestion is (shown as a hint next to it). */
export type SuggestionKind = 'relationship' | 'class' | 'data property';

/** A searchable term: how it is shown, its full IRI (tooltip), and every name it can be found by. */
export interface SuggestionSource {
  kind: SuggestionKind;
  display: string;
  title: string;
  names: string[];
}

export interface SearchSuggestion {
  /** Text put in the search box when chosen (the display name, which search also matches). */
  value: string;
  display: string;
  title: string;
  hint: SuggestionKind;
}

/** An IRI (or local name) written as `prefix:localName` when a prefix is known, else its local name. */
export function prefixedName(iriOrName: string, prefix: string | null | undefined): string {
  const local = iriOrName.includes('#')
    ? iriOrName.slice(iriOrName.lastIndexOf('#') + 1)
    : iriOrName.includes('/')
      ? iriOrName.slice(iriOrName.lastIndexOf('/') + 1)
      : iriOrName;
  return prefix ? `${prefix}:${local}` : local;
}

/** Suggestions for `query`: every source with a name containing it (case-insensitive), in source order,
 * one per display name, at most `limit`. */
export function buildSearchSuggestions(query: string, sources: SuggestionSource[], limit = 12): SearchSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const seen = new Set<string>();
  const out: SearchSuggestion[] = [];
  for (const s of sources) {
    if (out.length >= limit) break;
    if (seen.has(s.display) || !s.names.some((n) => (n || '').toLowerCase().includes(q))) continue;
    seen.add(s.display);
    out.push({ value: s.display, display: s.display, title: s.title, hint: s.kind });
  }
  return out;
}
