/**
 * The version-pinned URI of a term (#128): the term's URI with the ontology's IRI replaced by the
 * IRI of the version that is loaded, so a reference to it keeps meaning that release after later
 * ones change the vocabulary. Pure: reads the store, no DOM.
 *
 * `<onto>#Term` pins to `<versionIRI>#Term` and `<onto>/Term` to `<versionIRI>/Term`, the way
 * versioned ontologies are commonly published (`…/onto` → `…/onto/1.0.0`).
 */
import type { Store } from 'n3';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const OWL = 'http://www.w3.org/2002/07/owl#';

/** A plain version number (`1.2.0`, `v2.0.0-rc.1`), which can stand in a URI path segment. */
const VERSION_NUMBER = /^v?\d[\w.+-]*$/;

export interface OntologyVersion {
  ontologyIri: string;
  versionIri: string | null;
  versionInfo: string | null;
}

export type PinnedUri =
  /** `version` is what the label shows; `derived` when the version IRI was built from owl:versionInfo. */
  | { uri: string; version: string; derived: boolean }
  | { uri: null; reason: string };

/** The main ontology's IRI and declared version: the first owl:Ontology, as `getMainOntologyBase` picks it. Null without one. */
export function readOntologyVersion(store: Store): OntologyVersion | null {
  const ontology = store.getQuads(null, RDF_TYPE, OWL + 'Ontology', null).find((q) => q.subject.termType === 'NamedNode')?.subject;
  if (!ontology) return null;
  const value = (predicate: string): string | null => store.getObjects(ontology, OWL + predicate, null)[0]?.value ?? null;
  return { ontologyIri: ontology.value, versionIri: value('versionIRI'), versionInfo: value('versionInfo') };
}

const bare = (iri: string): string => iri.replace(/[#/]+$/, '');

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
    return { uri: versionIri + local, version: versionIri.slice(versionIri.lastIndexOf('/') + 1), derived: false };
  }
  const info = ontology.versionInfo?.trim();
  if (info && VERSION_NUMBER.test(info)) return { uri: `${base}/${info}${local}`, version: info, derived: true };
  return { uri: null, reason: 'The ontology declares no owl:versionIRI, and no owl:versionInfo that is a version number' };
}
