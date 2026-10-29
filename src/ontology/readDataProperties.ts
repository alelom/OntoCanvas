/**
 * The data properties a store declares, their datatype ranges and inherited ranges. Moved out of readOntology.ts (#198).
 */
import type { DataPropertyInfo } from '../types';
import { OWL, RDF, RDFS } from './vocab';
import { DataFactory, Store } from 'n3';
import { type RdfTerm, resolveExpressionClassUris } from '../rdf/classExpressions';
import { describeDataRange } from '../rdf/dataRanges';
import { extractLocalName } from '../utils/localName';
import { isDeprecated, withExampleImages } from './termFlags';

/**
 * Resolve an rdfs:range object to a datatype value string.
 * - A NamedNode datatype (e.g. xsd:string) → its URI.
 * - An anonymous OWL 2 datatype restriction ([ a rdfs:Datatype ; owl:onDatatype <dt> ; ... ]) →
 *   the base datatype URI (owl:onDatatype), so the graph shows "xsd:decimal" rather than the
 *   internal blank-node id. See issue #49.
 * - Anything else (e.g. an unrecognised blank node) → null, so no blank-node id leaks to the UI.
 */
export function resolveDatatypeRangeValue(store: Store, rangeObject: RdfTerm | undefined): string | null {
  if (!rangeObject) return null;
  if (rangeObject.termType === 'NamedNode') {
    return (rangeObject as { value: string }).value;
  }
  if (rangeObject.termType === 'BlankNode') {
    const onDatatype = store.getQuads(rangeObject as never, DataFactory.namedNode(OWL + 'onDatatype'), null, null)[0];
    if (onDatatype?.object?.termType === 'NamedNode') {
      return (onDatatype.object as { value: string }).value;
    }
  }
  return null;
}

export function getDataProperties(store: Store): DataPropertyInfo[] {
  const result: DataPropertyInfo[] = [];
  const seen = new Set<string>();
  const dpQuads = store.getQuads(null, RDF + 'type', OWL + 'DatatypeProperty', null);
  const OWL_THING = OWL + 'Thing';
  for (const q of dpQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    const subjUri = (subj as { value: string }).value;
    const name = extractLocalName(subjUri);
    if (seen.has(name)) continue;
    seen.add(name);
    const labelQuad = store.getQuads(subj, RDFS + 'label', null, null)[0];
    const label = labelQuad?.object?.value ?? name;
    const commentQuad = store.getQuads(subj, RDFS + 'comment', null, null)[0];
    const comment = commentQuad?.object?.value != null ? String(commentQuad.object.value) : null;
    // No rdfs:range means the ontology asserts no datatype. Record that as null rather than
    // substituting a default, so a typing stub stays distinguishable from an asserted xsd:string.
    const rangeQuad = store.getQuads(subj, RDFS + 'range', null, null)[0];
    const range = resolveDatatypeRangeValue(store, rangeQuad?.object as RdfTerm | undefined);
    const rangeExpression = rangeQuad ? describeDataRange(store, rangeQuad.object as RdfTerm) : null;
    
    // Extract domain(s) - rdfs:domain can appear multiple times
    const domainQuads = store.getQuads(subj, RDFS + 'domain', null, null);
    const domains: string[] = [];
    let hasGlobalDomain = false;
    for (const domainQuad of domainQuads) {
      const domainUris = resolveExpressionClassUris(store, domainQuad.object as RdfTerm);
      for (const domainUri of domainUris) {
        // An asserted owl:Thing domain means "every class"; keep it apart from asserting nothing.
        if (domainUri === OWL_THING) {
          hasGlobalDomain = true;
          continue;
        }
        const domainName = extractLocalName(domainUri);
        if (!domains.includes(domainName)) {
          domains.push(domainName);
        }
      }
    }
    const isDefinedByQuad = store.getQuads(subj, DataFactory.namedNode(RDFS + 'isDefinedBy'), null, null)[0];
    const isDefinedBy =
      isDefinedByQuad?.object?.termType === 'NamedNode'
        ? (isDefinedByQuad.object as { value: string }).value
        : null;
    result.push({
      name,
      label: String(label),
      comment: comment || undefined,
      range,
      ...(rangeExpression ? { rangeExpression } : {}),
      inheritedRange: range ? null : findInheritedRange(store, subjUri),
      domains,
      hasGlobalDomain,
      uri: subjUri,
      isDefinedBy: isDefinedBy ?? undefined,
      ...withExampleImages(store, subjUri),
      ...(isDeprecated(store, subj) ? { deprecated: true } : {}),
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Walk rdfs:subPropertyOf upwards looking for a super-property that declares an rdfs:range
 * *in this store*. External ontologies are never fetched, so the answer depends only on the
 * loaded document. Returns null when no ancestor in the document declares a range.
 */
export function findInheritedRange(
  store: Store,
  propertyUri: string
): { range: string; from: string } | null {
  const seen = new Set<string>([propertyUri]);
  let current = propertyUri;

  // Cycles in subPropertyOf are legal RDF; `seen` keeps the walk finite.
  for (;;) {
    const parentQuad = store.getQuads(DataFactory.namedNode(current), RDFS + 'subPropertyOf', null, null)[0];
    const parentUri = parentQuad?.object?.termType === 'NamedNode'
      ? (parentQuad.object as { value: string }).value
      : null;
    if (!parentUri || seen.has(parentUri)) return null;
    seen.add(parentUri);

    const rangeQuad = store.getQuads(DataFactory.namedNode(parentUri), RDFS + 'range', null, null)[0];
    const rangeUri = rangeQuad?.object && (rangeQuad.object as { value?: string }).value
      ? (rangeQuad.object as { value: string }).value
      : null;
    if (rangeUri) return { range: rangeUri, from: extractLocalName(parentUri) };

    current = parentUri;
  }
}
