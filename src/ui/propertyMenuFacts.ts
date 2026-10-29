/**
 * What the property menus need to know of a property to group it (#137): where it is defined, and, for an
 * annotation, whether it is used on any class (annotation styles colour classes, so one used on nothing else
 * cannot style anything). Pure.
 */
import type { Store } from 'n3';
import type { ExternalOntologyReference } from '../storage/types';
import { getPrefixForUri, isUriFromExternalOntology } from './externalRefs';
import { namespaceOf, ontologyDisplayName } from './importedNote';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const CLASS_TYPES = new Set(['http://www.w3.org/2002/07/owl#Class', 'http://www.w3.org/2000/01/rdf-schema#Class']);

/**
 * Where a property is defined when it is not in the open ontology: the prefix of that ontology when one is known,
 * else its name. Null for the open ontology's own properties (decided as for their labels and edge types).
 */
export function propertySource(
  property: { uri?: string | null; isDefinedBy?: string | null; contextOnly?: boolean },
  refs: ExternalOntologyReference[],
  mainBase: string | null
): string | null {
  const { uri, isDefinedBy, contextOnly } = property;
  if (!uri || !(contextOnly || isUriFromExternalOntology(uri, isDefinedBy, refs, mainBase))) return null;
  return getPrefixForUri(uri, isDefinedBy, refs, mainBase) ?? ontologyDisplayName(isDefinedBy || namespaceOf(uri));
}

/** Whether the annotation property `uri` is used on a class: only then can it style something. */
export function annotationUsedOnClass(store: Store, uri: string): boolean {
  return store.getQuads(null, uri, null, null).some((q) =>
    store.getObjects(q.subject, RDF_TYPE, null).some((t) => CLASS_TYPES.has(t.value))
  );
}

/** Whether the annotation property `uri` is used at all, on anything: the "Not used" group holds those that are not. */
export function annotationUsedAnywhere(store: Store, uri: string): boolean {
  return store.getQuads(null, uri, null, null).length > 0;
}

/** An annotation property's name as the menus show it: `prefix:name` when it is defined elsewhere and has a prefix. */
export function annotationDisplayName(
  ap: { name: string; uri?: string | null; isDefinedBy?: string | null },
  refs: ExternalOntologyReference[],
  mainBase: string | null
): string {
  const prefix = getPrefixForUri(ap.uri, ap.isDefinedBy, refs, mainBase);
  return prefix ? `${prefix}:${ap.name}` : ap.name;
}
