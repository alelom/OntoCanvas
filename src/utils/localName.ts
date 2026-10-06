/** The local name of a URI: the part after the last '#', else after the last '/', else the URI. */
export function extractLocalName(uri: string): string {
  if (uri.includes('#')) return uri.split('#').pop()!;
  if (uri.includes('/')) return uri.split('/').pop()!;
  return uri;
}
