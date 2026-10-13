/**
 * The line under an import in the imports dialog (#131): the version the imported ontology declares, and
 * whether the owl:imports IRI is pinned to that release or follows the latest one. Pure, no DOM.
 */
import { importPinning, versionLabel, type OntologyVersion } from '../lib/ontologyVersion';

/** What is known of an import: still being read in the background, not readable, or read (with its version, if any). */
export type ImportVersionStatus =
  | { state: 'reading' }
  | { state: 'unread' }
  | { state: 'read'; version: OntologyVersion | null };

const PINNING_TEXT = {
  pinned: ' · pinned to this release',
  latest: ' · follows the latest release',
  unknown: '',
};

const PINNING_TITLE = {
  pinned: 'The owl:imports IRI is this release\'s owl:versionIRI: later releases do not change what is imported.',
  latest: 'The owl:imports IRI is the ontology\'s own IRI: it reads whichever release is the latest.',
  unknown: 'The owl:imports IRI is neither the ontology\'s IRI nor its owl:versionIRI (e.g. a file address).',
};

export function describeImportVersion(importIri: string, status: ImportVersionStatus): { text: string; title: string } {
  if (status.state === 'reading') return { text: 'Version: reading…', title: 'The import is being read in the background.' };
  if (status.state === 'unread') {
    return { text: 'Version unknown: the import could not be read', title: 'It could not be fetched (offline, or the server does not allow it), so its version is unknown.' };
  }
  const label = versionLabel(status.version);
  const pinning = importPinning(importIri, status.version);
  const versionIri = status.version?.versionIri ? `\nowl:versionIRI: ${status.version.versionIri}` : '';
  return {
    text: (label ? `Version ${label}` : 'No version declared') + PINNING_TEXT[pinning],
    title: PINNING_TITLE[pinning] + versionIri,
  };
}
