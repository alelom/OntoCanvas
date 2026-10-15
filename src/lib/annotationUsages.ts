/**
 * Where an annotation property is used (#139): each term that carries it, with its label, what kind of term it is,
 * and the values. Shown in the Edit annotation property dialog and from the Annotation Properties menu. Pure.
 */
import type { Store } from 'n3';
import { extractLocalName } from '../utils/localName';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const SKOS_PREF_LABEL = 'http://www.w3.org/2004/02/skos/core#prefLabel';
const OWL = 'http://www.w3.org/2002/07/owl#';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';

/** Kinds of term, in the order they are listed. */
const KINDS: [type: string, kind: string][] = [
  [OWL + 'Class', 'class'],
  ['http://www.w3.org/2000/01/rdf-schema#Class', 'class'],
  [OWL + 'ObjectProperty', 'object property'],
  [OWL + 'DatatypeProperty', 'data property'],
  [OWL + 'AnnotationProperty', 'annotation property'],
  [OWL + 'NamedIndividual', 'individual'],
  [SKOS + 'Concept', 'concept'],
  [SKOS + 'ConceptScheme', 'concept scheme'],
  [OWL + 'Ontology', 'ontology'],
];
const KIND_ORDER = [...new Set(KINDS.map(([, kind]) => kind)), 'other'];

export interface AnnotationUsage {
  subject: string;
  label: string;
  kind: string;
  values: string[];
}

export function annotationUsages(store: Store, propertyUri: string): AnnotationUsage[] {
  const bySubject = new Map<string, AnnotationUsage>();
  for (const q of store.getQuads(null, propertyUri, null, null)) {
    const subject = q.subject.value;
    let usage = bySubject.get(subject);
    if (!usage) {
      const types = store.getObjects(q.subject, RDF_TYPE, null).map((t) => t.value);
      const label =
        store.getObjects(q.subject, RDFS_LABEL, null)[0]?.value ??
        store.getObjects(q.subject, SKOS_PREF_LABEL, null)[0]?.value ??
        (q.subject.termType === 'BlankNode' ? '(anonymous)' : extractLocalName(subject) || subject);
      const kind = KINDS.find(([type]) => types.includes(type))?.[1] ?? 'other';
      usage = { subject, label, kind, values: [] };
      bySubject.set(subject, usage);
    }
    usage.values.push(q.object.value);
  }
  return [...bySubject.values()].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.label.localeCompare(b.label)
  );
}
