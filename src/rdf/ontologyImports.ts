/**
 * The owl:imports a save adds for the external references (#90): on the ontology's real subject, skipping
 * the W3C core namespaces and URLs the document already imports.
 */
import { DataFactory, type Store } from 'n3';
import { STANDARD_NAMESPACES } from '../turtlePostProcess';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const OWL = 'http://www.w3.org/2002/07/owl#';

const normalize = (url: string) => url.replace(/[#/]$/, '');

/** The ontology IRI and the import URLs to add to it, or null when the store declares no named ontology. */
export function ontologyImportsToAdd(
  store: Store,
  externalRefs: Array<{ url: string }>
): { ontology: string; imports: string[] } | null {
  const ontology = store
    .getQuads(null, DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode(OWL + 'Ontology'), null)
    .find((q) => q.subject.termType === 'NamedNode')?.subject.value;
  if (!ontology) return null;
  // Imports on any subject: the external references are read from every owl:imports, so one that another
  // ontology in the document already imports belongs to that ontology and must not be copied onto this one.
  const present = new Set(
    store.getQuads(null, DataFactory.namedNode(OWL + 'imports'), null, null).map((q) => normalize(q.object.value))
  );
  const imports: string[] = [];
  for (const { url } of externalRefs) {
    const key = normalize(url);
    if (STANDARD_NAMESPACES.has(key) || present.has(key)) continue;
    present.add(key);
    imports.push(url);
  }
  return { ontology, imports };
}
