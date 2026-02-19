/**
 * Shared display base (IRI with trailing #) for showing derived identifiers in modals.
 * Uses class namespace so identifiers show as default prefix (e.g. :name) not ontology IRI (e.g. #Ontology#name).
 */

import type { Store } from 'n3';
import { getClassNamespace, getMainOntologyBase } from '../parser';

export const BASE_IRI = 'http://example.org/aec-drawing-ontology#';

export function getDisplayBase(store: Store | null | undefined): string {
  const displayBase = store
    ? getClassNamespace(store) ?? getMainOntologyBase(store) ?? BASE_IRI
    : BASE_IRI;
  return displayBase.endsWith('#') ? displayBase : displayBase + '#';
}
