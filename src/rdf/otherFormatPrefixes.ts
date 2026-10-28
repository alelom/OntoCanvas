/**
 * The prefixes of an RDF/XML or a JSON-LD file (#187), read from the file because rdf-parse reports none for these formats (it
 * does for Turtle). They are what the query panel starts its `PREFIX` lines with, so a file's own names work in a query.
 *
 * Pure text functions, no RDF parser, and none of them throws: a document they cannot read has no prefixes.
 */

export type OtherFormat = 'rdfxml' | 'jsonld';

// The media types and extensions rdf-parse reads as RDF/XML and as JSON-LD (not the XHTML and SVG ones, which it reads with
// other parsers), the same files the loader opens.
const RDF_XML_TYPES = new Set(['application/rdf+xml', 'application/xml', 'text/xml']);
const JSON_LD_TYPES = new Set(['application/ld+json', 'application/json']);

/** The format of a file by content type or, without one, by the end of its path; null for any other (Turtle reports its own). */
export function formatOf(options: { path?: string; contentType?: string }): OtherFormat | null {
  const type = options.contentType?.split(';')[0].trim().toLowerCase();
  if (type) {
    if (RDF_XML_TYPES.has(type)) return 'rdfxml';
    if (JSON_LD_TYPES.has(type)) return 'jsonld';
    return null;
  }
  const path = (options.path ?? '').split(/[?#]/)[0];
  if (/\.(rdf|owl|xml|rdfxml)$/i.test(path)) return 'rdfxml';
  if (/\.(jsonld|json)$/i.test(path)) return 'jsonld';
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
/** How deep entities may refer to entities before the value is given up on. */
const ENTITY_DEPTH = 10;
/** An entity or character reference left in a value after expansion. */
const LEFTOVER_REFERENCE = /&#?[A-Za-z0-9_.-]+;/;

/** The internal entities of a DOCTYPE (`<!ENTITY owl "http://www.w3.org/2002/07/owl#" >`), as the OWL API writes its files. */
function doctypeEntities(prologue: string): Record<string, string> {
  const entities: Record<string, string> = {};
  const withoutComments = prologue.replace(/<!--[\s\S]*?-->/g, '');
  for (const m of withoutComments.matchAll(/<!ENTITY\s+([A-Za-z_][\w.-]*)\s+(?:"([^"]*)"|'([^']*)')\s*>/g)) entities[m[1]] = m[2] ?? m[3];
  return entities;
}

/**
 * `value` with its entities expanded, an entity's own value too (`<!ENTITY onto "&base;onto#">`), or null when it cannot be: an
 * entity that is not declared, that refers back to itself, or is nested too deep. A wrong namespace would be worse than none.
 */
function expandEntities(value: string, entities: Record<string, string>, depth = 0, seen: string[] = []): string | null {
  if (depth > ENTITY_DEPTH) return null;
  let failed = false;
  const expanded = value.replace(/&([A-Za-z_][\w.-]*);/g, (whole, name: string) => {
    if (name in XML_ENTITIES) return XML_ENTITIES[name];
    if (!(name in entities) || seen.includes(name)) {
      failed = true;
      return whole;
    }
    const inner = expandEntities(entities[name], entities, depth + 1, [...seen, name]);
    if (inner === null) failed = true;
    return inner ?? whole;
  });
  return failed ? null : expanded;
}

/**
 * The start tag of the root element, and what comes before it, skipping the XML declaration, comments and the DOCTYPE (with its
 * internal subset, whose comments may hold quotes). Null when the text does not open with an element.
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
      // <!DOCTYPE name [ ...internal subset... ]>: the subset may hold > inside quotes, nested declarations and comments
      let depth = 0;
      let quote = '';
      let j = i + 2;
      for (; j < xml.length; j++) {
        const c = xml[j];
        if (quote) { if (c === quote) quote = ''; continue; }
        if (xml.startsWith('<!--', j)) {
          const end = xml.indexOf('-->', j + 4);
          if (end < 0) return null;
          j = end + 2;
          continue;
        }
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
    if (!value || LEFTOVER_REFERENCE.test(value)) continue;
    if (name === 'xmlns') prefixes[''] = value;
    else if (name.startsWith('xmlns:') && name !== 'xmlns:xml') prefixes[name.slice('xmlns:'.length)] = value;
  }
  return prefixes;
}

const HIERARCHICAL_IRI = /^[a-z][a-z\d+.-]*:\/\//i;
const URN = /^urn:\S+$/i;

/** An IRI a JSON-LD term can stand for as a prefix: `http://...` ending in `/` or `#`, or a urn ending in a colon (`urn:isbn:`). */
const isNamespaceIri = (iri: string): boolean => (HIERARCHICAL_IRI.test(iri) && /[/#]$/.test(iri)) || (URN.test(iri) && iri.endsWith(':'));
/** Any absolute IRI, for a term that says it is a prefix. */
const isAbsoluteIri = (iri: string): boolean => HIERARCHICAL_IRI.test(iri) || URN.test(iri);

/**
 * The namespace terms of the `@context` of a JSON-LD document: a term that maps to a namespace IRI (see isNamespaceIri), or
 * that says it is a prefix (`"@prefix": true`), unless it says it is not (`"@prefix": false`); `@vocab` is the default prefix.
 * Remote contexts (a URL) are not fetched.
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
        if (typeof definition === 'string' && isAbsoluteIri(definition)) prefixes[''] = definition;
        continue;
      }
      if (term.startsWith('@')) continue;
      const object = definition && typeof definition === 'object' ? (definition as Record<string, unknown>) : null;
      const iri = typeof definition === 'string' ? definition : object?.['@id'];
      if (typeof iri !== 'string' || object?.['@prefix'] === false) continue;
      if (object?.['@prefix'] === true ? isAbsoluteIri(iri) : isNamespaceIri(iri)) prefixes[term] = iri;
    }
  }
  return prefixes;
}
