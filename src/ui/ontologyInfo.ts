/**
 * The name and prefix of the open ontology, shown in the bottom bar (#113). Pure: reads the store and the
 * prefixes the file declares.
 */
import type { Store } from 'n3';
import { ontologyDisplayName } from './importedNote';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const OWL_ONTOLOGY = 'http://www.w3.org/2002/07/owl#Ontology';
/** In order of preference. */
const NAME_PREDICATES = [
  'http://www.w3.org/2000/01/rdf-schema#label',
  'http://purl.org/dc/terms/title',
  'http://purl.org/dc/elements/1.1/title',
];

export interface OntologyInfo {
  /** The ontology's IRI. */
  iri: string;
  name: string;
  /** The prefix the file declares for the ontology's own namespace, if any. */
  prefix: string | null;
}

const bare = (iri: string) => iri.replace(/[#/]+$/, '');

/** The open ontology's name and prefix, or null when the file declares no ontology. The default prefix (`:`)
 * isn't one worth showing, and formats that declare no prefixes have none. */
export function getOntologyInfo(store: Store, prefixMap: Record<string, string>): OntologyInfo | null {
  const declared = store.getQuads(null, RDF_TYPE, OWL_ONTOLOGY, null).find((q) => q.subject.termType === 'NamedNode');
  if (!declared) return null;
  const iri = declared.subject.value;

  let name: string | null = null;
  for (const predicate of NAME_PREDICATES) {
    const literal = store.getQuads(declared.subject, predicate, null, null).find((q) => q.object.termType === 'Literal');
    const value = literal?.object.value.trim();
    if (value) {
      name = value;
      break;
    }
  }

  const prefix = Object.entries(prefixMap).find(([p, namespace]) => p !== '' && bare(String(namespace)) === bare(iri))?.[0] ?? null;
  return { iri, name: name ?? ontologyDisplayName(iri), prefix };
}

/** "Name (prefix:)", or just the name when there is no prefix. */
export function formatOntologyInfo(info: OntologyInfo): string {
  return info.prefix ? `${info.name} (${info.prefix}:)` : info.name;
}
