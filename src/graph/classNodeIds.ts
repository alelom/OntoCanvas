/**
 * Which class a node stands for (#164).
 *
 * A class is drawn under its local name, and a local name stands for one class. When two classes share it (this
 * ontology's :Party and an external stub std:Party it subclasses), the ontology's own class keeps the name, whatever
 * order they are declared in; the other one is drawn by the external expansion under its full IRI, as an imported
 * class of the same name already is (lib:Book next to :Book). So a class matches a node only when the node is that
 * IRI, never by local name alone: matching by name turned `:Party rdfs:subClassOf std:Party` into the cycle
 * Party → Party, and the ontology could not be opened.
 */
import { extractLocalName } from '../utils/localName';

/** True when `uri` is in the ontology's own namespace (`mainBase` is its IRI with a trailing `#`). */
export function isInNamespace(uri: string, mainBase: string | null): boolean {
  if (!mainBase) return false;
  return uri.startsWith(mainBase) || uri === mainBase.slice(0, -1);
}

/**
 * The class IRIs in the order they claim local names: the ontology's own first, then the rest, each group in the
 * order given. The first class with a local name gets it.
 */
export function orderClassUris(uris: readonly string[], mainBase: string | null): string[] {
  return [...uris.filter((u) => isInNamespace(u, mainBase)), ...uris.filter((u) => !isInNamespace(u, mainBase))];
}

/** True when the node named after `uri`'s local name is that class (`classUriByName`: node id → class IRI). */
export function isNodeOf(classUriByName: ReadonlyMap<string, string>, uri: string): boolean {
  return classUriByName.get(extractLocalName(uri)) === uri;
}
