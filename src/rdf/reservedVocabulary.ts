/**
 * The reserved vocabulary: the IRIs in the owl, rdf, rdfs and xsd namespaces (OWL 2 Syntax, section 2.4) and in
 * the xml namespace (reserved by XML, for xml:lang and the like). The languages themselves define them, so there
 * is no ontology that "defines" them and nothing to import, although tools often list them in owl:imports: they
 * are not shown with a "defined by" note, are never fetched (the xml one answers with an HTML page, which
 * would set off a string of fallback requests), and are not listed as external references. The set is closed
 * by the specifications, so it is the one place that names it.
 *
 * It is a different thing from the vocabularies that are merely common (skos, foaf, dcterms, schema.org):
 * those are real third-party ontologies, and saying which one a term comes from is useful.
 */

/** Namespace IRIs, without a trailing # or /. */
export const RESERVED_VOCABULARY_NAMESPACES: readonly string[] = [
  'http://www.w3.org/2002/07/owl',
  'http://www.w3.org/1999/02/22-rdf-syntax-ns',
  'http://www.w3.org/2000/01/rdf-schema',
  'http://www.w3.org/2001/XMLSchema',
  'http://www.w3.org/XML/1998/namespace',
];

const stripSeparators = (iri: string) => iri.replace(/[#/]+$/, '');

/** Whether a namespace IRI (with or without a trailing # or /) is a reserved vocabulary's. */
export function isReservedNamespace(namespace: string): boolean {
  return RESERVED_VOCABULARY_NAMESPACES.includes(stripSeparators(namespace));
}

/** Whether a term IRI (owl:Thing, rdfs:Resource, xsd:string, …) is in a reserved vocabulary. */
export function isReservedVocabularyUri(uri: string): boolean {
  if (!/^https?:\/\//i.test(uri)) return false;
  const hash = uri.indexOf('#');
  const namespace = hash >= 0 ? uri.slice(0, hash) : uri.slice(0, uri.lastIndexOf('/'));
  return isReservedNamespace(namespace);
}
