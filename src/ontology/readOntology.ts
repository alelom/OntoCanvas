/**
 * Reading an ontology out of its store: the ontology's base, the namespace of its classes, and the object, data and
 * annotation properties it declares. Moved out of src/parser.ts unchanged (#193, step 2).
 */

import type { AnnotationPropertyInfo, DataPropertyInfo, ObjectPropertyInfo } from '../types';
import { BASE_IRI, HAS_CARDINALITY_PROP, OWL, RDF, RDFS, XSD_BOOLEAN } from './vocab';
import { DataFactory, type Quad as N3Quad, Store } from 'n3';
import { type RdfTerm, resolveExpressionClassUris } from '../rdf/classExpressions';
import { describeDataRange } from '../rdf/dataRanges';
import { exampleImagesOf } from '../lib/exampleImages';
import { extractLocalName } from '../utils/localName';
import { isExternalPropertyUri } from '../rdf/propertyNamespace';
import { rankedClassUris } from '../graph/classNodeIds';

/** Return the main ontology IRI with trailing # for prefix matching, or null if not found. */
export function getMainOntologyBase(store: Store): string | null {
  const ontQuads = store.getQuads(null, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Ontology'), null);
  if (ontQuads.length === 0 || ontQuads[0].subject.termType !== 'NamedNode') return null;
  const uri = (ontQuads[0].subject as { value: string }).value;
  return uri.endsWith('#') ? uri : uri + '#';
}

/**
 * Return the namespace (base IRI with trailing #) used for class URIs in this store.
 * Used for exampleImage so the predicate lives in the same namespace as classes (e.g. :exampleImage not :Ontology#exampleImage).
 */
export function getClassNamespace(store: Store): string | null {
  // The ontology's own classes first (#164): a stub of an external class declared first must not make new terms land in
  // the external namespace
  for (const uri of rankedClassUris(store)) {
    const localName = extractLocalName(uri);
    if (!localName) continue;
    if (uri.includes('#')) return uri.slice(0, uri.lastIndexOf('#') + 1);
    if (uri.includes('/')) return uri.slice(0, uri.lastIndexOf('/') + 1);
    return null;
  }
  return null;
}

export function getObjectProperties(store: Store): ObjectPropertyInfo[] {
  const result: ObjectPropertyInfo[] = [];
  const seen = new Set<string>();
  const mainBase = getMainOntologyBase(store);
  const opQuads = store.getQuads(null, RDF + 'type', OWL + 'ObjectProperty', null);
  for (const q of opQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    const subjUri = (subj as { value: string }).value;
    const localName = extractLocalName(subjUri);
    // Decided exactly as for edge types, so a property's name here is the type its edges carry (#87).
    const isFromMainOntology = !isExternalPropertyUri(subjUri, mainBase, BASE_IRI);
    // External (imported) properties always use full URI so we can show e.g. geo:hasGeometry in the UI.
    // Local (main ontology) properties use local name unless duplicate, then full URI so both appear in the list.
    const name = isFromMainOntology
      ? (seen.has(localName) ? subjUri : localName)
      : subjUri;
    if (seen.has(name)) continue;
    seen.add(localName);
    seen.add(name);
    const labelQuad = store.getQuads(subj, RDFS + 'label', null, null)[0];
    const label = labelQuad?.object?.value ?? name;
    const commentQuad = store.getQuads(subj, RDFS + 'comment', null, null)[0];
    const comment = commentQuad?.object?.value != null ? String(commentQuad.object.value) : null;
    const hasCardQuad = store.getQuads(subj, DataFactory.namedNode(HAS_CARDINALITY_PROP), null, null)[0];
    let hasCardinality = true;
    if (hasCardQuad?.object) {
      const val = String((hasCardQuad.object as { value?: unknown }).value ?? '').toLowerCase();
      hasCardinality = val === 'true' || val === '"true"';
    }
    const OWL_THING = OWL + 'Thing';
    const domainQuads = store.getQuads(subj, DataFactory.namedNode(RDFS + 'domain'), null, null);
    const rangeQuads = store.getQuads(subj, DataFactory.namedNode(RDFS + 'range'), null, null);
    let domain: string | null = null;
    let range: string | null = null;
    // An asserted owl:Thing is recorded as such, not folded into "no domain"; otherwise a file
    // that states the universal domain loses that statement on the next save.
    let hasGlobalDomain = false;
    let hasGlobalRange = false;
    if (domainQuads.length > 0 && domainQuads[0].object.termType === 'NamedNode') {
      const domainUri = (domainQuads[0].object as { value: string }).value;
      if (domainUri === OWL_THING) hasGlobalDomain = true;
      else domain = extractLocalName(domainUri);
    }
    if (rangeQuads.length > 0 && rangeQuads[0].object.termType === 'NamedNode') {
      const rangeUri = (rangeQuads[0].object as { value: string }).value;
      if (rangeUri === OWL_THING) hasGlobalRange = true;
      else range = extractLocalName(rangeUri);
    }
    const isDefinedByQuad = store.getQuads(subj, DataFactory.namedNode(RDFS + 'isDefinedBy'), null, null)[0];
    const subPropertyOfQuad = store.getQuads(subj, DataFactory.namedNode(RDFS + 'subPropertyOf'), null, null)[0];
    let isDefinedBy: string | null = null;
    let subPropertyOf: string | null = null;
    if (isDefinedByQuad?.object?.termType === 'NamedNode') isDefinedBy = (isDefinedByQuad.object as { value: string }).value;
    if (subPropertyOfQuad?.object?.termType === 'NamedNode') subPropertyOf = (subPropertyOfQuad.object as { value: string }).value;
    result.push({
      name,
      label: String(label),
      hasCardinality,
      comment: comment || undefined,
      domain: domain ?? undefined,
      range: range ?? undefined,
      hasGlobalDomain,
      hasGlobalRange,
      uri: subjUri,
      isDefinedBy: isDefinedBy ?? undefined,
      subPropertyOf: subPropertyOf ?? undefined,
      ...withExampleImages(store, subjUri),
      ...(isDeprecated(store, subj) ? { deprecated: true } : {}),
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/** Whether `subject` is declared `owl:deprecated true` (#137): kept for data written against earlier releases. */
/** `{ exampleImages }` when the term has example images (#142), else nothing. */
function withExampleImages(store: Store, subjectUri: string): { exampleImages?: string[] } {
  const exampleImages = exampleImagesOf(store, subjectUri);
  return exampleImages.length > 0 ? { exampleImages } : {};
}

function isDeprecated(store: Store, subject: N3Quad['subject']): boolean {
  return store.getObjects(subject, DataFactory.namedNode(OWL + 'deprecated'), null).some((o) => o.termType === 'Literal' && (o.value === 'true' || o.value === '1'));
}

export function getAnnotationProperties(
  store: Store,
  _externalOntologyReferences?: Array<{ url: string }>,
  _mainOntologyBase?: string | null
): AnnotationPropertyInfo[] {
  const result: AnnotationPropertyInfo[] = [];
  const seen = new Set<string>();
  // Map of subject URIs to their range values
  const rangeMap = new Map<string, string>();
  const RDFS_RANGE = RDFS + 'range';
  for (const q of store) {
    const predVal = (q.predicate as { value?: string; id?: string }).value ?? (q.predicate as { value?: string; id?: string }).id;
    if (predVal !== RDFS_RANGE) continue;
    const obj = q.object as { value?: string; id?: string };
    const rangeVal = obj?.value ?? obj?.id;
    if (typeof rangeVal === 'string') {
      const subj = q.subject as { value?: string; id?: string };
      const subjUri = subj?.value ?? subj?.id;
      if (subjUri) {
        rangeMap.set(subjUri, rangeVal);
      }
    }
  }
  const apQuads = store.getQuads(null, RDF + 'type', OWL + 'AnnotationProperty', null);
  for (const q of apQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    const subjUri = (subj as { value: string }).value;
    const name = extractLocalName(subjUri);
    if (seen.has(name)) continue;
    seen.add(name);
    const range = rangeMap.get(subjUri) ?? null;
    const isBoolean = range === XSD_BOOLEAN || range?.endsWith('#boolean') || false;
    
    // Extract isDefinedBy if present
    const isDefinedByQuad = store.getQuads(subj, DataFactory.namedNode(RDFS + 'isDefinedBy'), null, null)[0];
    let isDefinedBy: string | null = null;
    if (isDefinedByQuad?.object?.termType === 'NamedNode') {
      isDefinedBy = (isDefinedByQuad.object as { value: string }).value;
    }

    // Extract rdfs:comment (used as the value-input placeholder in the editor)
    const commentQuad = store.getQuads(subj, DataFactory.namedNode(RDFS + 'comment'), null, null)[0];
    const comment = commentQuad?.object?.value != null ? String(commentQuad.object.value) : null;

    result.push({ name, isBoolean, range, uri: subjUri, isDefinedBy: isDefinedBy ?? undefined, comment, ...(isDeprecated(store, subj) ? { deprecated: true } : {}) });
  }
  return result;
}

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
