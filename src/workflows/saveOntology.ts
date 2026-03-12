/**
 * Workflow for saving ontology to Turtle string
 * Pure business logic - no DOM, no file I/O, just returns string
 */

import type { Store } from 'n3';
import type { OriginalFileCache } from '../rdf/sourcePreservation';
import { storeToTurtle } from '../parser';
import { debugLog } from '../utils/debug';

export interface SaveOntologyParams {
  store: Store;
  originalTtlString?: string;
  originalFileCache?: OriginalFileCache;
  externalRefs?: Array<{ url: string; usePrefix: boolean; prefix?: string }>;
}

export interface SaveOntologyResult {
  ttlString: string;
}

/**
 * Save ontology to Turtle string
 * Pure business logic - no DOM, no file I/O
 */
export async function saveOntology(params: SaveOntologyParams): Promise<SaveOntologyResult> {
  const { store, originalTtlString, originalFileCache, externalRefs } = params;
  
  debugLog('[saveOntology] Starting save, hasCache:', !!originalFileCache, 'hasOriginalTtl:', !!originalTtlString);
  
  const ttlString = await storeToTurtle(store, externalRefs, originalTtlString, originalFileCache);
  
  debugLog('[saveOntology] Save completed, length:', ttlString.length);
  
  return { ttlString };
}
