/**
 * The annotation properties a store declares. Moved out of readOntology.ts (#198).
 */
import type { AnnotationPropertyInfo } from '../types';
import { OWL, RDF, RDFS, XSD_BOOLEAN } from './vocab';
import { DataFactory, Store } from 'n3';
import { extractLocalName } from '../utils/localName';
import { isDeprecated } from './termFlags';

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
