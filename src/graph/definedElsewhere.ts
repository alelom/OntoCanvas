/**
 * "Defined elsewhere" detection for class nodes.
 *
 * A class can be declared locally in a file yet actually be *defined* in another ontology:
 * - the "typing stub" pattern, where a term (e.g. geo:Geometry) carries rdfs:isDefinedBy
 *   pointing at its authoritative source; or
 * - simply a class whose own URI lives in a namespace other than the main ontology
 *   (e.g. `geo:Geometry a owl:Class` with no rdfs:isDefinedBy).
 *
 * Such nodes are shown dimmed and treated as read-only, like an imported/external node,
 * because editing them here does not change the real definition.
 */

/** Strip trailing '#' and '/' so namespace variants compare equal. More than one can be there: the main base
 * of an ontology whose IRI ends in a slash, such as FOAF, is `http://xmlns.com/foaf/0.1/#` (#114). */
function normalizeNamespace(uri: string): string {
  return uri.replace(/[#/]+$/, '');
}

/** Namespace of a URI: everything up to and including the '#', or the final '/'. */
function namespaceOf(uri: string): string {
  const hash = uri.indexOf('#');
  if (hash >= 0) return uri.slice(0, hash + 1);
  const slash = uri.lastIndexOf('/');
  if (slash >= 0) return uri.slice(0, slash + 1);
  return uri;
}

/**
 * True when the node is declared locally but defined in another ontology — either because it
 * carries an rdfs:isDefinedBy that does not point at the main ontology, or because its own URI
 * lives in a namespace other than the main ontology.
 *
 * @param node     the graph node (`isDefinedBy` and `uri` are read)
 * @param mainBase the main ontology base IRI (usually with a trailing '#'), or null if unknown.
 *                 When null: an isDefinedBy is treated as "elsewhere"; a bare uri cannot be judged
 *                 (returns false) since there is nothing to compare it against.
 */
export function isDefinedElsewhere(
  node: { isDefinedBy?: string | null; uri?: string },
  mainBase: string | null
): boolean {
  const main = mainBase ? normalizeNamespace(mainBase) : null;

  if (node.isDefinedBy) {
    if (!main) return true;
    return normalizeNamespace(node.isDefinedBy) !== main;
  }

  if (node.uri && main) {
    return normalizeNamespace(namespaceOf(node.uri)) !== main;
  }

  return false;
}
