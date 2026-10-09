/**
 * Module for opening local files in new tabs using IndexedDB tokens.
 * This avoids CORS issues when opening external ontologies from local files.
 */

import { storeLocalFileContent } from './localFileTokenStorage';
import { loadOntologyFromContent } from './loadOntology';
import { getMainOntologyBase } from '../parser';

export interface LocalFileMatch {
  content: string;
  fileName: string;
  pathHint: string;
  handle: FileSystemFileHandle;
}

const RDF_EXTENSIONS = ['.ttl', '.turtle', '.owl', '.rdf', '.rdfxml', '.jsonld', '.json'];
const RDF_EXTENSION_RE = /.(ttl|turtle|owl|rdf|rdfxml|jsonld|json)$/i;

/** An IRI without a trailing # or /, for comparing ontology IRIs. */
const bareIri = (iri: string) => iri.replace(/[#/]$/, '');

/**
 * Find the file in `directory` that defines the external ontology at `externalUrl` (its ontology IRI
 * matches the URL). Likely names are tried first (from the open file's name and the URL); then every RDF
 * file in the folder is read (#103).
 *
 * @param directory - The open ontology's folder (see getOrRequestOntologyDirectory)
 * @param fileName - The open file's name
 * @param externalUrl - The external ontology URL to match
 * @returns The matching file data, or null if not found
 */
export async function findMatchingLocalFile(
  directory: FileSystemDirectoryHandle,
  fileName: string,
  externalUrl: string
): Promise<LocalFileMatch | null> {
  const target = bareIri(externalUrl);
  const tried = new Set<string>();

  const tryFile = async (name: string, handle?: FileSystemFileHandle): Promise<LocalFileMatch | null> => {
    if (tried.has(name)) return null;
    tried.add(name);
    try {
      const fileHandle = handle ?? (await directory.getFileHandle(name));
      const content = await (await fileHandle.getFile()).text();
      const { parseResult } = await loadOntologyFromContent(content, name);
      const base = getMainOntologyBase(parseResult.store);
      if (!base || bareIri(base) !== target) return null;
      return { content, fileName: name, pathHint: name, handle: fileHandle };
    } catch {
      return null; // missing, unreadable or not an ontology
    }
  };

  // Likely names first: if the open file is "object-props-child-child.ttl" and the URL is
  // "http://example.org/object-extended", try "object-props-child.ttl", "object-extended.ttl", …
  const possibleNames = new Set<string>();
  const currentBaseName = fileName ? fileName.replace(RDF_EXTENSION_RE, '') : '';
  if (currentBaseName) {
    for (const pattern of [
      currentBaseName.replace(/-child-child$/, '-child'),
      currentBaseName.replace(/-child$/, '-parent'),
      currentBaseName.replace(/-parent$/, ''),
    ]) {
      for (const ext of RDF_EXTENSIONS) possibleNames.add(`${pattern}${ext}`);
    }
  }
  try {
    const urlObj = new URL(externalUrl);
    const pathParts = urlObj.pathname.split('/').filter((part) => part);
    const lastPart = pathParts[pathParts.length - 1] || urlObj.hostname.split('.')[0];
    if (lastPart) for (const ext of RDF_EXTENSIONS) possibleNames.add(`${lastPart}${ext}`);
  } catch {
    // Not a URL: only the folder scan below can find it.
  }
  for (const name of possibleNames) {
    const match = await tryFile(name);
    if (match) return match;
  }

  // Then every RDF file in the folder.
  const values = (directory as FileSystemDirectoryHandle & { values?: () => AsyncIterable<FileSystemHandle> }).values;
  if (typeof values !== 'function') return null;
  try {
    for await (const entry of values.call(directory)) {
      if (entry.kind !== 'file' || !RDF_EXTENSION_RE.test(entry.name) || entry.name === fileName) continue;
      const match = await tryFile(entry.name, entry as FileSystemFileHandle);
      if (match) return match;
    }
  } catch {
    // The folder can't be listed: nothing more to try.
  }
  return null;
}

/**
 * Open a local file in a new tab using IndexedDB token storage.
 * 
 * @param fileData - The local file data to open
 * @returns The URL to open in the new tab
 */
export async function openLocalFileInNewTab(fileData: LocalFileMatch): Promise<string> {
  const token = await storeLocalFileContent(
    fileData.content,
    fileData.fileName,
    fileData.pathHint
  );
  
  const base = window.location.origin + window.location.pathname;
  return `${base}?localFile=${encodeURIComponent(token)}`;
}
