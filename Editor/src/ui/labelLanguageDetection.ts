/**
 * Utilities for detecting and managing language-tagged labels in the ontology store.
 */

import type { Store } from 'n3';
import { DataFactory } from 'n3';

const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';

/**
 * Common ISO 639-1 language codes for ontology labels.
 * This list includes the most commonly used languages in ontologies.
 */
const COMMON_LANGUAGE_CODES = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'zh', 'ko',
  'ar', 'hi', 'nl', 'pl', 'tr', 'sv', 'da', 'fi', 'no', 'cs',
  'hu', 'ro', 'el', 'he', 'th', 'vi', 'id', 'ms', 'uk', 'bg',
  'hr', 'sk', 'sl', 'et', 'lv', 'lt', 'ga', 'mt', 'is', 'mk',
  'sq', 'sr', 'bs', 'ca', 'eu', 'gl', 'cy', 'gd', 'br', 'co',
  'eo', 'ia', 'ie', 'io', 'la', 'oc', 'sc', 'wa', 'yi', 'zu'
].sort();

/**
 * Detect all available languages from rdfs:label triples in the store.
 * Returns sorted array of language codes (without @ prefix).
 * Includes all common language codes, not just the ones currently used.
 * Defaults to ['en'] if store is empty.
 */
export function detectAvailableLanguages(store: Store): string[] {
  const languagesInStore = new Set<string>();
  
  // Get all rdfs:label quads
  const labelQuads = store.getQuads(null, RDFS + 'label', null, null);
  
  for (const quad of labelQuads) {
    const object = quad.object as { termType: string; language?: string };
    // Check if object is a literal with a language tag
    if (object.termType === 'Literal') {
      if (object.language) {
        languagesInStore.add(object.language);
      }
    }
  }
  
  // Always include all common language codes
  // This allows users to add labels in any language, not just ones already used
  const allLanguages = new Set<string>(COMMON_LANGUAGE_CODES);
  
  // Also include any languages found in the store that aren't in the common list
  for (const lang of languagesInStore) {
    allLanguages.add(lang);
  }
  
  // Sort alphabetically and return as array
  return Array.from(allLanguages).sort();
}

/**
 * Get all language-tagged labels for a specific resource.
 * Returns a Map of language code -> label value.
 * If a label exists without a language tag, it's treated as 'en' (default).
 */
export function getLabelsForResource(store: Store, resourceUri: string): Map<string, string> {
  const labels = new Map<string, string>();
  const subject = DataFactory.namedNode(resourceUri);
  
  const labelQuads = store.getQuads(subject, RDFS + 'label', null, null);
  
  for (const quad of labelQuads) {
    const object = quad.object as { termType: string; value: string; language?: string };
    if (object.termType === 'Literal') {
      const language = object.language || 'en'; // Default to 'en' if no language tag
      labels.set(language, object.value);
    }
  }
  
  return labels;
}
