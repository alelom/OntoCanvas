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
 * Whether an address is plainly on this machine or a private network: loopback, link-local, the private, shared (100.64/10) and
 * special (192.0.0/24, 198.18/15) IPv4 ranges, the same inside IPv6 (::ffff:a.b.c.d), IPv6 unique-local and link-local, and
 * .local or .localhost names, a trailing dot or not. The data added is not something the user looked at, so it must not make
 * the page reach such hosts (#239 review). A name that resolves to such an address, or a redirect to one, cannot be told from
 * the browser before the request.
 */
export function isPrivateAddress(iri: string): boolean {
  let host: string;
  try {
    host = new URL(iri).hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  } catch {
    return true;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  // An IPv4 address inside IPv6 is that IPv4 address; the URL parser writes it in hex (::ffff:7f00:1).
  const mapped = /^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/.exec(host);
  if (mapped) {
    host = mapped[1] ?? [parseInt(mapped[2], 16) >> 8, parseInt(mapped[2], 16) & 255, parseInt(mapped[3], 16) >> 8, parseInt(mapped[3], 16) & 255].join('.');
  }
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (v4) {
    const [a, b, c] = [Number(v4[1]), Number(v4[2]), Number(v4[3])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  // Any other IPv6 address is public only in global unicast (2000::/3): that closes the rarer spellings of a local one
  // (IPv4-compatible, NAT64, site-local) as a class (#239 third review).
  if (host.includes(':')) {
    const first = host.split(':')[0];
    return !(first.length === 4 && /^[23]/.test(first));
  }
  return false;
}

/** `fetchTtl` that never asks for a private address (#239 second review): the imports of the data's ontologies, at every level, are read through it. */
export function publicAddressesOnly(fetchTtl: (url: string) => Promise<string | null>): (url: string) => Promise<string | null> {
  return (url) => (isPrivateAddress(url) ? Promise.resolve(null) : fetchTtl(url));
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
 * With no ontology open (data files explored on their own), it also says how to see the individuals in their full context: it
 * takes the place of the note on the workspace then, which said the same in a way that read as a contradiction (#240).
 */
export const OPEN_ONTOLOGY_FIRST = 'Open an ontology first, and the data after it, to see the individuals in their full ontology context.';

export function dataOntologiesNote(opened: DataOntology[], failed: DataOntology[], { noOntologyOpen = false } = {}): string | null {
  const names = (list: DataOntology[]) => inWords(list.map((o) => ontologyName(o.iri)));
  const isGuess = (o: DataOntology) => o.via === 'namespace';
  const what = ", read as context only, to name its classes: they can't be edited or saved";
  const parts: string[] = [];
  const openedNamed = opened.filter((o) => !isGuess(o));
  const openedGuessed = opened.filter(isGuess);
  const failedNamed = failed.filter((o) => !isGuess(o));
  const failedGuessed = failed.filter(isGuess);
  if (openedNamed.length) parts.push(`Loaded the ontologies the data was made with: ${names(openedNamed)}${what}.`);
  if (openedGuessed.length) parts.push(`Loaded from the namespaces of the data's classes: ${names(openedGuessed)}${what}.`);
  if (failedNamed.length) {
    parts.push(`Could not load ${names(failedNamed)}, which the data says it was made with: the address may not answer with RDF, or may not let this page read it.`);
  }
  if (failedGuessed.length) parts.push(`No ontology found at the namespaces of the data's classes (${names(failedGuessed)}).`);
  if (noOntologyOpen && opened.length) parts.push(OPEN_ONTOLOGY_FIRST);
  return parts.length ? parts.join(' ') : null;
}
