/**
 * How one RDF term is shown in a query result: an IRI as a prefixed name when a declared prefix fits, a literal
 * quoted with its language or datatype, a blank node as `_:label`. The full value goes in `title` (the tooltip).
 */

import type { StoreTerm } from './runQuery';

export type TermKind = 'iri' | 'literal' | 'blank' | 'quad';

export interface FormattedTerm {
  text: string;
  title: string;
  kind: TermKind;
}

const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';
const RDF_LANG_STRING = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString';
/** What can follow the colon of a prefixed name without escaping: a deliberately simple subset of PN_LOCAL. */
const SIMPLE_LOCAL_NAME = /^[A-Za-z0-9_][A-Za-z0-9_\-.]*$/;

/** The IRI as `prefix:local` under the longest namespace that fits, else as `<iri>`. */
function iriText(iri: string, prefixes: Record<string, string>): string {
  let best: { prefix: string; namespace: string } | undefined;
  for (const [prefix, namespace] of Object.entries(prefixes)) {
    if (!namespace || !iri.startsWith(namespace) || iri.length === namespace.length) continue;
    if (!SIMPLE_LOCAL_NAME.test(iri.slice(namespace.length)) || iri.endsWith('.')) continue;
    if (!best || namespace.length > best.namespace.length) best = { prefix, namespace };
  }
  return best ? `${best.prefix}:${iri.slice(best.namespace.length)}` : `<${iri}>`;
}

const escapeLiteral = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');

export function formatTerm(term: StoreTerm, prefixes: Record<string, string>): FormattedTerm {
  switch (term.termType) {
    case 'NamedNode':
      return { text: iriText(term.value, prefixes), title: term.value, kind: 'iri' };
    case 'BlankNode':
      return { text: `_:${term.value}`, title: `_:${term.value}`, kind: 'blank' };
    case 'Literal': {
      const quoted = `"${escapeLiteral(term.value)}"`;
      const datatype = term.datatype.value;
      const suffix = term.language
        ? `@${term.language}`
        : datatype === XSD_STRING || datatype === RDF_LANG_STRING
          ? ''
          : `^^${iriText(datatype, prefixes)}`;
      return { text: quoted + suffix, title: term.value, kind: 'literal' };
    }
    case 'Quad': {
      const part = (t: StoreTerm) => formatTerm(t, prefixes).text;
      const text = `<< ${part(term.subject)} ${part(term.predicate)} ${part(term.object)} >>`;
      return { text, title: text, kind: 'quad' };
    }
    case 'Variable':
      return { text: `?${term.value}`, title: `?${term.value}`, kind: 'iri' };
    case 'DefaultGraph':
      return { text: 'default graph', title: 'default graph', kind: 'iri' };
  }
}
