/**
 * The version an ontology declares (owl:versionIRI, owl:versionInfo), how it is labelled, and how two
 * versions compare. Pure: reads a store, no DOM, no network.
 */
import type { Store } from 'n3';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const OWL = 'http://www.w3.org/2002/07/owl#';

/** A plain version number (`1.2.0`, `v2.0.0-rc.1`), which can stand in a URI path segment. */
export const VERSION_NUMBER = /^v?\d[\w.+-]*$/;

export interface OntologyVersion {
  ontologyIri: string;
  versionIri: string | null;
  versionInfo: string | null;
}

/** An IRI without its trailing `#` or `/`, so the spellings of one IRI compare equal. */
export const bareIri = (iri: string): string => iri.replace(/[#/]+$/, '');

/** The last path segment of an IRI (`…/onto/1.2.0/` → `1.2.0`). */
export const lastSegment = (iri: string): string => bareIri(iri).slice(bareIri(iri).lastIndexOf('/') + 1);

/** A version number inside a path segment: `building-1.1.0.ttl`, `onto-v2.0.0-rc.1.owl`. */
const VERSION_IN_SEGMENT = /(?:^|[^A-Za-z0-9.])(v?\d+(?:\.\d+)+(?:-[A-Za-z]+(?:\.?\d+)*)?)/;

/**
 * The version number a version IRI is named with, from the last path segment that holds one
 * (`…/1.2.0`, `…/1.2.0/onto.owl`, `…/building-1.1.0.ttl`); null when none does.
 */
export function versionInIri(iri: string): string | null {
  let path: string;
  try {
    path = new URL(iri).pathname;
  } catch {
    path = iri;
  }
  for (const segment of path.split('/').filter(Boolean).reverse()) {
    if (VERSION_NUMBER.test(segment) && !/\.[A-Za-z]+$/.test(segment)) return segment;
    const found = VERSION_IN_SEGMENT.exec(segment);
    if (found) return found[1];
  }
  return null;
}

/** The main ontology's IRI and declared version: the first owl:Ontology, as `getMainOntologyBase` picks it. Null without one. */
export function readOntologyVersion(store: Store): OntologyVersion | null {
  const ontology = store.getQuads(null, RDF_TYPE, OWL + 'Ontology', null).find((q) => q.subject.termType === 'NamedNode')?.subject;
  if (!ontology) return null;
  const value = (predicate: string): string | null => store.getObjects(ontology, OWL + predicate, null)[0]?.value.trim() || null;
  return { ontologyIri: ontology.value, versionIri: value('versionIRI'), versionInfo: value('versionInfo') };
}

/** How to name the version (#130): owl:versionInfo, else the version number in owl:versionIRI; null when neither. */
export function versionLabel(version: OntologyVersion | null): string | null {
  if (!version) return null;
  if (version.versionInfo) return version.versionInfo;
  return version.versionIri ? versionInIri(version.versionIri) : null;
}

/**
 * Whether an `owl:imports` IRI names one release of the imported ontology (its owl:versionIRI, "pinned"), or
 * the ontology itself, which follows the latest release ("latest"). "unknown" when it is neither (e.g. a
 * file address) or the import could not be read (#131).
 */
export function importPinning(importIri: string, imported: OntologyVersion | null): 'pinned' | 'latest' | 'unknown' {
  if (!imported) return 'unknown';
  if (imported.versionIri && bareIri(importIri) === bareIri(imported.versionIri)) return 'pinned';
  if (bareIri(importIri) === bareIri(imported.ontologyIri)) return 'latest';
  return 'unknown';
}

const PARSED_VERSION = /^v?(\d+(?:\.\d+)*)(?:-([\w.-]+))?(?:\+[\w.-]+)?$/;

/**
 * How two version numbers compare (negative, 0, positive), as semantic versions: numeric parts in order,
 * missing parts count as 0, and a pre-release (`-rc.1`) comes before its release. Null when either is
 * not a version number.
 */
export function compareVersions(a: string, b: string): number | null {
  const pa = PARSED_VERSION.exec(a.trim());
  const pb = PARSED_VERSION.exec(b.trim());
  if (!pa || !pb) return null;
  const na = pa[1].split('.').map(Number);
  const nb = pb[1].split('.').map(Number);
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const d = (na[i] ?? 0) - (nb[i] ?? 0);
    if (d !== 0) return d;
  }
  if (pa[2] === undefined || pb[2] === undefined) return (pa[2] === undefined ? 1 : 0) - (pb[2] === undefined ? 1 : 0);
  return pa[2].localeCompare(pb[2], undefined, { numeric: true });
}
