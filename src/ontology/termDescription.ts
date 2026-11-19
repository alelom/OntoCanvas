/**
 * A term's description (#247). Ontologies that keep a term's definition in skos:definition and use rdfs:comment for
 * commentary (rationale, examples, the standard a term corresponds to) show the definition as the description, and the
 * comment after it, apart. A term with no definition shows its rdfs:comment as the description, as before.
 *
 * A term can have several of either, each in several languages. All are kept, in a stable order: the display language
 * first, then English, then untagged, then any other language, and alphabetical within each. The two properties are
 * ordered separately.
 *
 * A term's label is chosen by the same order (#249): `pickLabel`, `readLabel` (an rdfs:label, else a skos:prefLabel, #250).
 *
 * The editing dialogs are untouched: they still edit rdfs:comment (`comment` on the term records).
 */
import type { Store } from 'n3';
import { RDFS } from './vocab';

export const SKOS_DEFINITION = 'http://www.w3.org/2004/02/skos/core#definition';
const SKOS_PREF_LABEL = 'http://www.w3.org/2004/02/skos/core#prefLabel';

export interface TermDescription {
  definitions: string[];
  comments: string[];
}

interface Literal {
  value: string;
  language: string;
}

/** The language shown, as the browser sets it; English when it names none. */
export function displayLanguage(): string {
  return (typeof navigator !== 'undefined' && navigator.language) || 'en';
}

const primary = (tag: string): string => tag.toLowerCase().split('-')[0];

/** 0 the display language (a regional tag counts as its language, either way round), 1 English, 2 untagged, 3 any other. */
function rankOf(language: string, preferred: string): number {
  if (language && primary(language) === primary(preferred)) return 0;
  if (primary(language) === 'en') return 1;
  return language ? 3 : 2;
}

/** The values, each text once, in the order described above. */
export function orderLiterals(literals: Literal[], preferred: string): string[] {
  const sorted = literals
    .map((l) => ({ ...l, language: l.language.toLowerCase(), rank: rankOf(l.language, preferred) }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (a.rank === 3 ? (a.language < b.language ? -1 : a.language > b.language ? 1 : 0) : 0) ||
        a.value.localeCompare(b.value) ||
        (a.value < b.value ? -1 : a.value > b.value ? 1 : 0)
    );
  return [...new Set(sorted.map((l) => l.value))];
}

function literalsOf(store: Store, subject: string, predicate: string): Literal[] {
  return store
    .getQuads(subject, predicate, null, null)
    .filter((q) => q.object.termType === 'Literal')
    .map((q) => ({ value: q.object.value, language: (q.object as { language?: string }).language ?? '' }));
}

/** The label shown for a term (#249): the first by the same rule; undefined when it has none. */
export function pickLabel(literals: Literal[], preferred: string = displayLanguage()): string | undefined {
  let best: Literal | undefined;
  let bestRank = 4;
  for (const l of literals) {
    const rank = rankOf(l.language, preferred);
    if (rank > bestRank) continue;
    const language = l.language.toLowerCase();
    if (
      !best ||
      rank < bestRank ||
      (rank === 3 && language < best.language.toLowerCase()) ||
      ((rank !== 3 || language === best.language.toLowerCase()) && (l.value.localeCompare(best.value) || (l.value < best.value ? -1 : 0)) < 0)
    ) {
      best = l;
      bestRank = rank;
    }
  }
  return best?.value;
}

/** A term's rdfs:label from one store, or from several; with none, its skos:prefLabel (#250). */
export function readLabel(store: Store | readonly Store[], subject: string, language: string = displayLanguage()): string | undefined {
  const stores = 'getQuads' in store ? [store] : store;
  const labelOf = (predicate: string) => pickLabel(stores.flatMap((s) => literalsOf(s, subject, predicate)), language);
  return labelOf(RDFS + 'label') ?? labelOf(SKOS_PREF_LABEL);
}

/** A term's description from one store, or from several (an individual is described across the data's stores). */
export function readTermDescription(store: Store | readonly Store[], subject: string, language: string = displayLanguage()): TermDescription {
  const stores = 'getQuads' in store ? [store] : store;
  const all = (predicate: string) => stores.flatMap((s) => literalsOf(s, subject, predicate));
  return {
    definitions: orderLiterals(all(SKOS_DEFINITION), language),
    comments: orderLiterals(all(RDFS + 'comment'), language),
  };
}

/** The `description` field of a term record, spread into it; nothing for a term with neither property. */
export function withDescription(store: Store, subject: string): { description?: TermDescription } {
  const description = readTermDescription(store, subject);
  return description.definitions.length || description.comments.length ? { description } : {};
}

/**
 * What to show: `text` is the description, `comment` the commentary to show after it ('' for none). With no definition
 * the comments are the description. A term without a `description` (an imported or built-in one) shows `fallback`.
 */
export function describeTerm(
  description: TermDescription | undefined,
  fallback: string | null | undefined,
  showComment: boolean
): { text: string; comment: string } {
  if (!description) return { text: fallback ?? '', comment: '' };
  const join = (values: string[]) => values.join('\n\n');
  if (description.definitions.length === 0) return { text: join(description.comments), comment: '' };
  return { text: join(description.definitions), comment: showComment ? join(description.comments) : '' };
}

/**
 * Sets the `comment` of a term record (the rdfs:comment the dialogs edit) and keeps its `description` in step: the dialogs
 * leave one rdfs:comment in the store, and the definitions are not theirs to touch.
 */
export function setComment(term: { comment?: string | null; description?: TermDescription }, comment: string | null | undefined): void {
  term.comment = comment || undefined;
  if (term.description) term.description = { ...term.description, comments: comment ? [comment] : [] };
}
