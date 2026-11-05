/**
 * The ontologies the data was made with (#236). Generated data often says so: a run of a batch process records the versions it
 * used on its prov:Activity (prov:used), a dataset its dct:conformsTo or void:vocabulary. When it names none, the namespaces of
 * its classes and properties are the guess. What is loaded already is left out. Pure: only finds; opening them, after the
 * user says so, is src/workflows/dataOntologies.ts.
 */
import type { Store } from 'n3';
import { isReservedNamespace } from '../rdf/reservedVocabulary';
import { definedByName } from './importedClasses';

export interface DataOntology {
  /** The address to read it from: a version IRI, an ontology IRI, or a namespace without its # or /. */
  iri: string;
  /** How the data names it. */
  via: 'prov:used' | 'dct:conformsTo' | 'void:vocabulary' | 'namespace';
}

const NAMED_BY: Array<[string, DataOntology['via']]> = [
  ['http://www.w3.org/ns/prov#used', 'prov:used'],
  ['http://purl.org/dc/terms/conformsTo', 'dct:conformsTo'],
  ['http://rdfs.org/ns/void#vocabulary', 'void:vocabulary'],
];
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const MAX_ONTOLOGIES = 10;

const isHttp = (iri: string): boolean => /^https?:\/\//i.test(iri);
const bare = (iri: string): string => iri.replace(/[#/]+$/, '');
const namespaceOf = (iri: string): string => bare(iri.includes('#') ? iri.slice(0, iri.indexOf('#')) : iri.slice(0, iri.lastIndexOf('/')));

/**
 * @param loaded - The IRIs, version IRIs and addresses of what is loaded already (the ontology and its imports).
 */
export function findDataOntologies(dataStores: Store[], loaded: Iterable<string>): DataOntology[] {
  const skip = new Set([...loaded].map(bare));
  const found = new Map<string, DataOntology>();
  const add = (iri: string, via: DataOntology['via']): void => {
    const key = bare(iri);
    if (found.size >= MAX_ONTOLOGIES || !isHttp(key) || skip.has(key) || found.has(key)) return;
    found.set(key, { iri: key, via });
  };

  for (const [predicate, via] of NAMED_BY) {
    for (const store of dataStores) for (const object of store.getObjects(null, predicate, null)) if (object.termType === 'NamedNode') add(object.value, via);
  }
  if (found.size) return [...found.values()];

  // Named nowhere: the namespaces of the classes and the properties, less the languages' own (rdf, rdfs, owl, xsd).
  const namespace = (iri: string): void => {
    const ns = namespaceOf(iri);
    if (ns && !isReservedNamespace(ns)) add(ns, 'namespace');
  };
  for (const store of dataStores) {
    for (const quad of store.getQuads(null, null, null, null)) {
      if (quad.predicate.value === RDF_TYPE) {
        if (quad.object.termType === 'NamedNode') namespace(quad.object.value);
      } else {
        namespace(quad.predicate.value);
      }
    }
  }
  return [...found.values()];
}

/** "adiro_drawing_metadata 7.0.1": the end of the address, with the version after the name. */
export const ontologyName = (iri: string): string => definedByName(iri).replace('/', ' ');
