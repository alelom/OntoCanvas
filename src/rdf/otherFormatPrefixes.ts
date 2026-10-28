/**
 * The prefixes of an RDF/XML or a JSON-LD file (#187), read from the file because rdf-parse reports none for these formats (it
 * does for Turtle). They are what the query panel starts its `PREFIX` lines with, so a file's own names work in a query.
 *
 * Pure text functions, no RDF parser, and none of them throws: a document they cannot read has no prefixes.
 */

export type OtherFormat = 'rdfxml' | 'jsonld';

/** The format of a file by content type or, without one, by the end of its path; null for any other (Turtle reports its own). */
export function formatOf(options: { path?: string; contentType?: string }): OtherFormat | null {
  const type = options.contentType?.toLowerCase();
  if (type) {
    if (type.includes('rdf+xml')) return 'rdfxml';
    if (type.includes('ld+json')) return 'jsonld';
    return null;
  }
  const path = (options.path ?? '').split(/[?#]/)[0];
  if (/\.(rdf|owl|xml)$/i.test(path)) return 'rdfxml';
  if (/\.jsonld$/i.test(path)) return 'jsonld';
  return null;
}

/** The prefixes read from `text` when it is RDF/XML or JSON-LD (by `options`), and none for any other format. */
export function otherFormatPrefixes(text: string, options: { path?: string; contentType?: string }): Record<string, string> {
  switch (formatOf(options)) {
    case 'rdfxml':
      return rdfXmlPrefixes(text);
    case 'jsonld':
      return jsonLdPrefixes(text);
    default:
      return {};
  }
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** The internal entities of a DOCTYPE (`<!ENTITY owl "http://www.w3.org/2002/07/owl#" >`), as the OWL API writes its files. */
function doctypeEntities(prologue: string): Record<string, string> {
  const entities: Record<string, string> = {};
  for (const m of prologue.matchAll(/<!ENTITY\s+([A-Za-z_][\w.-]*)\s+(?:"([^"]*)"|'([^']*)')\s*>/g)) entities[m[1]] = m[2] ?? m[3];
  return entities;
}

const expandEntities = (value: string, entities: Record<string, string>): string =>
  value.replace(/&([A-Za-z_][\w.-]*);/g, (whole, name: string) => entities[name] ?? XML_ENTITIES[name] ?? whole);

/**
 * The start tag of the root element, and what comes before it, skipping the XML declaration, comments and the DOCTYPE (with its
 * internal subset). Null when the text does not open with an element.
 */
function rootStartTag(xml: string): { tag: string; prologue: string } | null {
  let i = 0;
  while (i < xml.length) {
    while (i < xml.length && /\s/.test(xml[i])) i++;
    if (xml.startsWith('<?', i)) {
      const end = xml.indexOf('?>', i);
      if (end < 0) return null;
      i = end + 2;
    } else if (xml.startsWith('<!--', i)) {
      const end = xml.indexOf('-->', i);
      if (end < 0) return null;
      i = end + 3;
    } else if (xml.startsWith('<!', i)) {
      // <!DOCTYPE name [ ...internal subset... ]>: the subset may hold > inside quotes and nested declarations
      let depth = 0;
      let quote = '';
      let j = i + 2;
      for (; j < xml.length; j++) {
        const c = xml[j];
        if (quote) { if (c === quote) quote = ''; continue; }
        if (c === '"' || c === "'") quote = c;
        else if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      if (j >= xml.length) return null;
      i = j + 1;
    } else if (xml[i] === '<' && /[A-Za-z_]/.test(xml[i + 1] ?? '')) {
      let quote = '';
      let j = i + 1;
      for (; j < xml.length; j++) {
        const c = xml[j];
        if (quote) { if (c === quote) quote = ''; continue; }
        if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
      }
      if (j >= xml.length) return null;
      return { tag: xml.slice(i, j + 1), prologue: xml.slice(0, i) };
    } else {
      return null;
    }
  }
  return null;
}

/** The `xmlns` and `xmlns:p` declarations of the root element of an RDF/XML document; the default namespace is the prefix `''`. */
export function rdfXmlPrefixes(xml: string): Record<string, string> {
  const root = rootStartTag(xml);
  if (!root) return {};
  const entities = doctypeEntities(root.prologue);
  const prefixes: Record<string, string> = {};
  for (const m of root.tag.matchAll(/([A-Za-z_][\w.-]*(?::[\w.-]+)?)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const name = m[1];
    const value = expandEntities(m[2] ?? m[3], entities);
    if (!value) continue;
    if (name === 'xmlns') prefixes[''] = value;
    else if (name.startsWith('xmlns:') && name !== 'xmlns:xml') prefixes[name.slice('xmlns:'.length)] = value;
  }
  return prefixes;
}

const ABSOLUTE_IRI = /^[a-z][a-z\d+.-]*:\/\//i;

/**
 * The namespace terms of the `@context` of a JSON-LD document: a term that maps to an absolute IRI ending in `/` or `#`, or
 * that says it is a prefix (`"@prefix": true`); `@vocab` is the default prefix. Remote contexts (a URL) are not fetched.
 */
export function jsonLdPrefixes(text: string): Record<string, string> {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return {};
  }
  const node = Array.isArray(document) ? document[0] : document;
  if (!node || typeof node !== 'object') return {};
  const context = (node as Record<string, unknown>)['@context'];
  const prefixes: Record<string, string> = {};
  for (const entry of Array.isArray(context) ? context : [context]) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    for (const [term, definition] of Object.entries(entry as Record<string, unknown>)) {
      if (term === '@vocab') {
        if (typeof definition === 'string' && ABSOLUTE_IRI.test(definition)) prefixes[''] = definition;
        continue;
      }
      if (term.startsWith('@')) continue;
      const object = definition && typeof definition === 'object' ? (definition as Record<string, unknown>) : null;
      const iri = typeof definition === 'string' ? definition : object?.['@id'];
      if (typeof iri !== 'string' || !ABSOLUTE_IRI.test(iri)) continue;
      if (/[/#]$/.test(iri) || object?.['@prefix'] === true) prefixes[term] = iri;
    }
  }
  return prefixes;
}
