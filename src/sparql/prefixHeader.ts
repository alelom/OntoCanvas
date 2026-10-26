/**
 * The prefixes a query starts with and results are shown under: rdf, rdfs, owl and xsd, then every prefix the
 * open file declares.
 */

const STANDARD_PREFIXES: Record<string, string> = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  owl: 'http://www.w3.org/2002/07/owl#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
};

/** A prefix SPARQL can parse (a simplification of PN_PREFIX): empty, or a letter then letters, digits, `_`, `-`, `.`. */
const VALID_PREFIX = /^([A-Za-z]([A-Za-z0-9_\-.]*[A-Za-z0-9_\-])?)?$/;
/** An IRI that can sit between `<` and `>` as written. */
const VALID_IRI = /^[^\s<>"{}|^`\\]+$/;

/** The standard prefixes plus the file's own; the file's IRI wins if it redefines a standard prefix. */
export function withStandardPrefixes(declared: Record<string, string>): Record<string, string> {
  return { ...STANDARD_PREFIXES, ...declared };
}

export function prefixHeader(declared: Record<string, string>): string {
  const merged = withStandardPrefixes(declared);
  const standard = Object.keys(STANDARD_PREFIXES);
  const others = Object.keys(merged)
    .filter((prefix) => !standard.includes(prefix))
    .sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));

  return [...standard, ...others]
    .filter((prefix) => VALID_PREFIX.test(prefix) && VALID_IRI.test(merged[prefix]))
    .map((prefix) => `PREFIX ${prefix}: <${merged[prefix]}>`)
    .join('\n');
}
