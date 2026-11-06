/**
 * The ontologies the data was made with (#236): found in the data (src/abox/dataOntologies.ts), and opened on their own when
 * data is added, as an ontology's imports are (#239: it asked first before), with what was read told in the bottom bar. They
 * are read as context with their own imports, as an ontology's imports are (#104), and never written to the open
 * ontology or saved; opening another ontology forgets them. The individuals then use them for the names of their classes
 * (#235).
 */
import type { Store } from 'n3';
import { session } from '../state/appState';
import { dataOntologiesNote, findDataOntologies, type DataOntology } from '../abox/dataOntologies';
import { setNotice } from '../ui/statusNotices';
import { debugWarn } from '../utils/debug';
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
function findOntologiesOfData(dataStores: Store[]): DataOntology[] {
  return session.ttlStore ? findDataOntologies(dataStores, loadedOntologyIris()) : [];
}

/** What was tried for the open ontology: each address once, so a failure is not tried again on every change of the data. */
let triedFor: Store | null = null;
let tried = new Set<string>();
let opened: DataOntology[] = [];
let failed: DataOntology[] = [];
/** One read at a time: data added while one runs is looked at after it. */
let reading: Promise<void> = Promise.resolve();

/**
 * Opens, on their own, the ontologies the data names that are not loaded or tried yet (#239: it asked first before), and says
 * in the bottom bar what was read and what could not be. Called whenever the data changes.
 */
export function openOntologiesOfData(dataStores: Store[]): Promise<void> {
  reading = reading
    .then(async () => {
      const store = session.ttlStore;
      if (!store) return;
      if (triedFor !== store) {
        // Another ontology: what was tried was for the one before (its notes were cleared with it).
        triedFor = store;
        tried = new Set();
        opened = [];
        failed = [];
      }
      const found = findOntologiesOfData(dataStores).filter((o) => !tried.has(o.iri));
      if (!found.length) return;
      found.forEach((o) => tried.add(o.iri));
      const outcome = await openDataOntologies(found.map((o) => o.iri));
      if (store !== session.ttlStore) return;
      opened.push(...found.filter((o) => outcome.opened.includes(o.iri)));
      failed.push(...found.filter((o) => outcome.failed.includes(o.iri)));
      setNotice('data-ontologies', dataOntologiesNote(opened, failed));
    })
    .catch((error) => debugWarn('Could not read the ontologies the data names:', error));
  return reading;
}

/**
 * Settles once the ontologies of the data added so far are read (or could not be). An initial load waits for it under its
 * loading screen, so the classes are drawn once, named, instead of being named again a moment after (#239).
 */
export const ontologiesOfDataRead = (): Promise<void> => reading;

/** Reads the ontologies at `iris` (and their imports) as context. Says which were read and which could not be. */
async function openDataOntologies(iris: string[]): Promise<{ opened: string[]; failed: string[] }> {
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
