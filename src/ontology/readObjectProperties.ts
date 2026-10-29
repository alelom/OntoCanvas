/**
 * The object properties a store declares. Moved out of readOntology.ts (#198).
 */
import type { ObjectPropertyInfo } from '../types';
import { BASE_IRI, HAS_CARDINALITY_PROP, OWL, RDF, RDFS } from './vocab';
import { DataFactory, Store } from 'n3';
import { extractLocalName } from '../utils/localName';
import { isExternalPropertyUri } from '../rdf/propertyNamespace';
import { getMainOntologyBase } from './ontologyBase';
import { isDeprecated, withExampleImages } from './termFlags';

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
