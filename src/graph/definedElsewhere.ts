/**
 * "Defined elsewhere" detection for class nodes.
 *
 * A class can be declared locally in a file yet actually be *defined* in another ontology —
 * the "typing stub" pattern, where a term (e.g. geo:Geometry) is reused for alignment and
 * carries rdfs:isDefinedBy pointing at its authoritative source. Such nodes should be shown
 * dimmed and treated as read-only, like an imported/external node, because editing the stub
 * here does not change the real definition.
 */

/** Strip a single trailing '#' or '/' so namespace variants compare equal. */
function normalizeNamespace(uri: string): string {
  if (uri.endsWith('#') || uri.endsWith('/')) return uri.slice(0, -1);
  return uri;
}

/**
 * True when the node is declared locally but defined in another ontology, i.e. it carries an
 * rdfs:isDefinedBy that does not point at the main ontology.
 *
 * @param node     the graph node (only `isDefinedBy` is read)
 * @param mainBase the main ontology base IRI (usually with a trailing '#'), or null if unknown.
 *                 When null, any isDefinedBy is treated as "elsewhere".
 */
export function isDefinedElsewhere(
  node: { isDefinedBy?: string | null },
  mainBase: string | null
): boolean {
  const definedBy = node.isDefinedBy;
  if (!definedBy) return false;
  if (!mainBase) return true;
  return normalizeNamespace(definedBy) !== normalizeNamespace(mainBase);
}
