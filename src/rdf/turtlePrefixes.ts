/**
 * Prefix declarations read straight from Turtle source text (pure, no RDF parser).
 *
 * The minimal-diff serializer works on the original text, so it needs to resolve the prefixed
 * subject written on each line — `prov:Agent` — to the URI the parsed store uses. Getting that
 * mapping wrong is not cosmetic: a subject whose prefix cannot be resolved looks absent from the
 * document, and the serializer then appends it as though the user had just added it.
 *
 * Both Turtle spellings are accepted: `@prefix p: <ns> .` and the SPARQL-style `PREFIX p: <ns>`.
 */

/** `@prefix p: <ns> .` / `PREFIX p: <ns>`, with the empty prefix allowed. Global: files declare many. */
const PREFIX_DECLARATION = /(?:@prefix|PREFIX)\s+([A-Za-z_][\w.\-]*)?:\s*<([^>]*)>/gi;

/**
 * Every prefix declared in `text`, as prefix → namespace. The empty prefix is keyed `''`.
 *
 * Later declarations of the same prefix win, which is what a Turtle parser does.
 */
export function parseTurtlePrefixes(
  text: string,
  into: Map<string, string> = new Map()
): Map<string, string> {
  if (!text) return into;
  for (const match of text.matchAll(PREFIX_DECLARATION)) {
    into.set(match[1] ?? '', match[2]);
  }
  return into;
}

/**
 * Resolve a subject as written in the source to a full URI, or null when it cannot be resolved.
 *
 * `<http://...>` is already absolute. `:Local` uses the empty prefix, `p:Local` the named one.
 * An unknown prefix returns null rather than a guess — a wrong URI would be worse than none.
 */
export function resolveTurtlePrefixedName(
  prefixedName: string,
  prefixes: ReadonlyMap<string, string>
): string | null {
  const value = prefixedName.trim();
  if (value.startsWith('<') && value.endsWith('>')) return value.slice(1, -1);

  const colon = value.indexOf(':');
  if (colon === -1) return null;
  const namespace = prefixes.get(value.slice(0, colon));
  return namespace == null ? null : namespace + value.slice(colon + 1);
}
