/**
 * The ontologies the data was made with (#236): found in the data (src/abox/dataOntologies.ts), and opened when the user says
 * so. They are read as context with their own imports, as an ontology's imports are (#104), and never written to the open
 * ontology or saved; opening another ontology forgets them. The individuals then use them for the names of their classes
 * (#235).
 */
import type { Store } from 'n3';
import { session } from '../state/appState';
import { findDataOntologies, type DataOntology } from '../abox/dataOntologies';
import { loadOntologies } from '../lib/importedDeclarations';
import { getMainOntologyBase } from '../ontology/ontologyBase';
import { fetchExternalOntologyTtl } from '../externalOntologySearch';
import { applyImportedOntologies, IMPORT_READ_MAX_BYTES, IMPORT_READ_TIMEOUT_MS } from './loadOntologyFlow';

const OWL_VERSION_IRI = 'http://www.w3.org/2002/07/owl#versionIRI';
const bare = (iri: string): string => iri.replace(/[#/]+$/, '');

/** The IRIs, version IRIs and addresses of what is loaded: the open ontology and the ontologies read as context. */
function loadedOntologyIris(): string[] {
  const store = session.ttlStore;
  if (!store) return [];
  const own = [getMainOntologyBase(store), ...store.getObjects(null, OWL_VERSION_IRI, null).map((o) => o.value)];
  const context = session.importedOntologies.flatMap((o) => [o.url, o.iri]);
  return [...own, ...context].filter((iri): iri is string => !!iri);
}

/** The ontologies the data names that are not loaded yet. */
export function findOntologiesOfData(dataStores: Store[]): DataOntology[] {
  return session.ttlStore ? findDataOntologies(dataStores, loadedOntologyIris()) : [];
}

/** Reads the ontologies at `iris` (and their imports) as context. Says which were read and which could not be. */
export async function openDataOntologies(iris: string[]): Promise<{ opened: string[]; failed: string[] }> {
  const store = session.ttlStore;
  if (!store) return { opened: [], failed: iris };
  // Loaded since they were offered (the imports are read in the background): nothing to read, and not a failure.
  const loaded = new Set(loadedOntologyIris().map(bare));
  const read = await loadOntologies(
    iris.filter((iri) => !loaded.has(bare(iri))),
    (url) => fetchExternalOntologyTtl(url, { timeoutMs: IMPORT_READ_TIMEOUT_MS, maxBytes: IMPORT_READ_MAX_BYTES, fetchStandardVocabularies: true }),
    { exclude: [...loaded] }
  );
  // Another ontology was opened meanwhile: these were for the one before.
  if (store !== session.ttlStore) return { opened: [], failed: [] };
  if (read.length) applyImportedOntologies([...session.importedOntologies, ...read]);
  const got = new Set([...loaded, ...read.map((o) => bare(o.url))]);
  return { opened: iris.filter((iri) => got.has(bare(iri))), failed: iris.filter((iri) => !got.has(bare(iri))) };
}
