/**
 * Describing anonymous OWL 2 data ranges for display (#63): datatype restrictions (owl:onDatatype +
 * owl:withRestrictions facets) as the base type with an interval and other facets, e.g.
 * `xsd:decimal [0.0, 1.0]` or `xsd:string pattern "[A-Z]+"`, and datatype unions / intersections /
 * complements / enumerations. The node keeps showing the base type (resolveDatatypeRangeValue); this
 * text is for the modal and tooltip.
 */
import { DataFactory, type Store } from 'n3';
import { extractLocalName } from '../utils/localName';
import { literalDisplay, readRdfList, type RdfTerm } from './classExpressions';

const OWL = 'http://www.w3.org/2002/07/owl#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

/** A datatype URI in short form: `xsd:decimal`, `rdfs:Literal`, `rdf:PlainLiteral`, else its local name. */
function shortDatatype(uri: string): string {
  for (const [ns, prefix] of [[XSD, 'xsd'], [RDFS, 'rdfs'], [RDF, 'rdf']] as const) {
    if (uri.startsWith(ns)) return `${prefix}:${uri.slice(ns.length)}`;
  }
  return extractLocalName(uri);
}

/** `xsd:decimal [0.0, 1.0]` etc. from owl:onDatatype + owl:withRestrictions. */
function describeDatatypeRestriction(store: Store, base: string, facetList: RdfTerm | undefined): string {
  const bounds: { min?: string; minOpen?: boolean; max?: string; maxOpen?: boolean } = {};
  const others: string[] = [];
  for (const facetNode of facetList ? readRdfList(store, facetList) : []) {
    for (const q of store.getQuads(facetNode as never, null, null, null)) {
      const facet = q.predicate.value.startsWith(XSD) ? q.predicate.value.slice(XSD.length) : extractLocalName(q.predicate.value);
      const value = q.object.value;
      if (facet === 'minInclusive' || facet === 'minExclusive') Object.assign(bounds, { min: value, minOpen: facet === 'minExclusive' });
      else if (facet === 'maxInclusive' || facet === 'maxExclusive') Object.assign(bounds, { max: value, maxOpen: facet === 'maxExclusive' });
      else others.push(facet === 'pattern' ? `pattern "${value}"` : `${facet} ${value}`);
    }
  }
  const parts = [base];
  if (bounds.min != null || bounds.max != null) {
    const lo = bounds.min != null ? `${bounds.minOpen ? '(' : '['}${bounds.min}` : '(−∞';
    const hi = bounds.max != null ? `${bounds.max}${bounds.maxOpen ? ')' : ']'}` : '∞)';
    parts.push(`${lo}, ${hi}`);
  }
  if (others.length > 0) parts.push(others.join(', '));
  return parts.join(' ');
}

/** Readable text for an anonymous data range, or null for a named datatype (nothing to add) or an
 * unrecognised form. Nested ranges are described recursively. */
export function describeDataRange(store: Store, range: RdfTerm): string | null {
  if (range.termType !== 'BlankNode') return null;
  const objectOf = (pred: string) => store.getQuads(range as never, DataFactory.namedNode(OWL + pred), null, null)[0]?.object as RdfTerm | undefined;
  // An anonymous operand with spaces at the top level (a union, an intersection, a faceted range) is
  // parenthesised, so ¬(A ∪ B) never reads as ¬A ∪ B.
  const operand = (t: RdfTerm): string => {
    if (t.termType === 'NamedNode' && t.value) return shortDatatype(t.value);
    const inner = describeDataRange(store, t) ?? '?';
    return inner.includes(' ') && !inner.startsWith('{') ? `(${inner})` : inner;
  };

  const onDatatype = objectOf('onDatatype');
  if (onDatatype) return describeDatatypeRestriction(store, operand(onDatatype), objectOf('withRestrictions'));
  for (const [pred, glyph] of [['unionOf', ' ∪ '], ['intersectionOf', ' ∩ ']] as const) {
    const list = objectOf(pred);
    if (list) return readRdfList(store, list).map(operand).join(glyph);
  }
  const complemented = objectOf('datatypeComplementOf');
  if (complemented) return `¬${operand(complemented)}`;
  const values = objectOf('oneOf');
  if (values) return `{${readRdfList(store, values).map((t) => literalDisplay(t)).join(', ')}}`;
  return null;
}
