/**
 * Where to look for a display config when the version that was opened has none of its own (#136): the ontology
 * IRI names the latest release, whose layout and colours usually fit an earlier one too. Pure, no network.
 */
import { bareIri, type OntologyVersion } from './ontologyVersion';

/**
 * The ontology IRI, when the open ontology is one version of it (it declares owl:versionIRI) opened from another
 * address; null when what was opened is the ontology IRI itself, or no version is declared.
 */
export function latestDisplayConfigSource(openedUrl: string, version: OntologyVersion | null): string | null {
  if (!version?.versionIri || !/^https?:\/\//i.test(version.ontologyIri)) return null;
  return bareIri(openedUrl) === bareIri(version.ontologyIri) ? null : version.ontologyIri;
}
