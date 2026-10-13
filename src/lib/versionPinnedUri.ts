/**
 * The version-pinned URI of a term (#128): the term's URI with the ontology's IRI replaced by the
 * IRI of the version that is loaded, so a reference to it keeps meaning that release after later
 * ones change the vocabulary. Pure, no DOM.
 *
 * `<onto>#Term` pins to `<versionIRI>#Term` and `<onto>/Term` to `<versionIRI>/Term`, the way
 * versioned ontologies are commonly published (`…/onto` → `…/onto/1.0.0`).
 */
import { bareIri as bare, lastSegment, VERSION_NUMBER, type OntologyVersion } from './ontologyVersion';

export type PinnedUri =
  /** `version` is what the label shows; `derived` when the version IRI was built from owl:versionInfo. */
  | { uri: string; version: string; derived: boolean }
  | { uri: null; reason: string };

/** The version-pinned URI of `termUri`, or why there is none. */
export function versionPinnedUri(termUri: string | null, ontology: OntologyVersion | null): PinnedUri {
  if (!termUri) return { uri: null, reason: 'No URI recorded for this item' };
  if (!ontology) return { uri: null, reason: 'No owl:Ontology is declared, so there is no version to pin to' };
  const base = bare(ontology.ontologyIri);
  const separator = termUri[base.length];
  if (!termUri.startsWith(base) || (separator !== '#' && separator !== '/')) {
    return { uri: null, reason: `Not defined in this ontology (${base}), so it has no version-pinned URI here` };
  }
  const local = termUri.slice(base.length);
  if (ontology.versionIri) {
    const versionIri = bare(ontology.versionIri);
    return { uri: versionIri + local, version: lastSegment(versionIri), derived: false };
  }
  const info = ontology.versionInfo?.trim();
  if (info && VERSION_NUMBER.test(info)) return { uri: `${base}/${info}${local}`, version: info, derived: true };
  return { uri: null, reason: 'The ontology declares no owl:versionIRI, and no owl:versionInfo that is a version number' };
}
