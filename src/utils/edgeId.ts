/**
 * Parse edge IDs in the format "from->to:type".
 * When type is a full URI (e.g. http://...), the first ":" in "to:type" is inside
 * the "to" URI (e.g. "http:"), so we split on ":http" to get to and type.
 * When type is short (subClassOf, dataprop), "to" may be a full URI, so we split on the last ":".
 */
export function parseEdgeId(edgeId: string): { from: string; to: string; type: string } | null {
  const s = String(edgeId);
  const arrowIndex = s.indexOf('->');
  if (arrowIndex === -1) return null;
  const from = s.substring(0, arrowIndex);
  const afterArrow = s.substring(arrowIndex + 2);
  const colonForHttp = afterArrow.indexOf(':http');
  const colonIndex =
    colonForHttp >= 0 ? colonForHttp : afterArrow.lastIndexOf(':');
  if (colonIndex === -1) return null;
  const to = afterArrow.substring(0, colonIndex);
  const type = afterArrow.substring(colonIndex + 1);
  return { from, to, type };
}
