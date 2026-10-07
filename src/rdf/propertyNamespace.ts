/**
 * Whether an object property is external to the loaded ontology, which decides its edge type: a local
 * property's edges are typed by its local name (`knows`), an external one's by its full IRI. Restriction
 * edges and domain/range edges must decide this the same way, or one property is drawn as two
 * relationships (two legend entries, two colours; #87). Pure, so it can be unit-tested.
 */

/** The part of an IRI before its local name: up to the `#`, or up to the last `/` (exclusive). */
function namespaceOf(uri: string): string {
  return uri.includes('#') ? uri.slice(0, uri.indexOf('#')) : uri.split('/').slice(0, -1).join('/');
}

/**
 * @param mainBase the ontology's base as getMainOntologyBase returns it (`<ontology IRI>#`), or null
 * when the store declares no ontology.
 * @param defaultBase the base new terms are created in, used when there is no ontology to compare with.
 */
export function isExternalPropertyUri(propUri: string, mainBase: string | null, defaultBase: string): boolean {
  if (!mainBase) return !propUri.startsWith(defaultBase);
  const mainNamespace = mainBase.includes('#') ? mainBase.slice(0, mainBase.indexOf('#')) : mainBase;
  return namespaceOf(propUri) !== mainNamespace;
}
