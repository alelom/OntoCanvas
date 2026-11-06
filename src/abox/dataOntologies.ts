/**
 * The ontologies the data was made with (#236). Generated data often says so: a run of a batch process records the versions it
 * used on its prov:Activity (prov:used), a dataset its dct:conformsTo or void:vocabulary. When it names none, the namespaces of
 * its classes and properties are the guess. What is loaded already is left out. Pure: only finds; opening them, after the
 * data is added, is src/workflows/dataOntologies.ts.
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

/**
 * Whether an address is on this machine or a private network: loopback, link-local, private IPv4 ranges, IPv6 unique-local and
 * link-local, and .local or .localhost names. The data added is not something the user looked at, so it must not make the
 * page reach such hosts (#239 review); an ontology is read from the public web.
 */
export function isPrivateAddress(iri: string): boolean {
  let host: string;
  try {
    host = new URL(iri).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return true;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '0.0.0.0' || host === '::' || host === '::1') return true;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 127 || a === 10 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return /^(fc|fd|fe8|fe9|fea|feb)/.test(host) && host.includes(':');
}
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
    if (found.size >= MAX_ONTOLOGIES || !isHttp(key) || isPrivateAddress(key) || skip.has(key) || found.has(key)) return;
    found.set(key, { iri: key, via });
  };

  // Data that names any ontology says what it was made with, even when all of them are loaded already: no guessing then.
  let named = false;
  for (const [predicate, via] of NAMED_BY) {
    for (const store of dataStores) {
      for (const object of store.getObjects(null, predicate, null)) {
        if (object.termType !== 'NamedNode' || !isHttp(object.value)) continue;
        named = true;
        add(object.value, via);
      }
    }
  }
  if (named) return [...found.values()];

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

/** "a", "a and b", "a, b and c". */
const inWords = (names: string[]): string => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/**
 * The note in the bottom bar about the ontologies of the data, read on their own (#239); null when none was tried. One the data
 * names that could not be read is a problem worth its reason; a namespace guessed at that holds no ontology is only said.
 */
export function dataOntologiesNote(opened: DataOntology[], failed: DataOntology[]): string | null {
  const names = (list: DataOntology[]) => inWords(list.map((o) => ontologyName(o.iri)));
  const named = failed.filter((o) => o.via !== 'namespace');
  const guessed = failed.filter((o) => o.via === 'namespace');
  const parts: string[] = [];
  if (opened.length) parts.push(`Read as context: ${names(opened)}. They name the data's classes, and are never saved.`);
  if (named.length) parts.push(`The data names ${names(named)}, which could not be read: the address may not answer with RDF, or may not let this page read it.`);
  if (guessed.length) parts.push(`No ontology could be read at the namespaces of its classes and properties (${names(guessed)}).`);
  return parts.length ? parts.join(' ') : null;
}
