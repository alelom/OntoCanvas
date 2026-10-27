/**
 * The prefixes a Turtle file declares, for the query panel's starting `PREFIX` lines. Reads `@prefix p: <iri> .`
 * and the SPARQL-style `PREFIX p: <iri>`, the default prefix (`:`) included. A declaration must start its line, so
 * text inside a literal or a comment that merely looks like one is not picked up. Files in other formats
 * (RDF/XML, JSON-LD) declare their prefixes differently and give none here.
 */

const DECLARATION = /^[ \t]*(?:@prefix|prefix)[ \t]+([A-Za-z](?:[\w.-]*[\w-])?)?[ \t]*:[ \t]*<([^>\s]*)>/gim;

export function declaredPrefixes(content: string): Record<string, string> {
  const prefixes: Record<string, string> = {};
  for (const match of content.matchAll(DECLARATION)) prefixes[match[1] ?? ''] = match[2];
  return prefixes;
}
