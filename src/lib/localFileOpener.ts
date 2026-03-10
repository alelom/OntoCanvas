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

/**
 * Find a local file that matches the given external ontology URL.
 * Searches sibling files in the same directory as the current file.
 * 
 * @param fileHandle - The current file handle
 * @param fileName - The current file name
 * @param externalUrl - The external ontology URL to match
 * @returns The matching file data, or null if not found
 */
export async function findMatchingLocalFile(
  fileHandle: FileSystemFileHandle,
  fileName: string,
  externalUrl: string
): Promise<LocalFileMatch | null> {
  // Check if getParent is available
  if (!('getParent' in fileHandle) || typeof (fileHandle as FileSystemFileHandle & { getParent?: () => Promise<FileSystemDirectoryHandle> }).getParent !== 'function') {
    return null;
  }

  try {
    const parentDir = await (fileHandle as FileSystemFileHandle & { getParent: () => Promise<FileSystemDirectoryHandle> }).getParent();
    const normalizedExternalUrl = externalUrl.endsWith('#') ? externalUrl.slice(0, -1) : externalUrl;
    const normalizedExternalUrlNoSlash = normalizedExternalUrl.replace(/\/$/, '');
    
    // Try to find all .ttl, .owl, .rdf files in the same directory
    const rdfExtensions = ['.ttl', '.turtle', '.owl', '.rdf', '.rdfxml', '.jsonld', '.json'];
    
    // Get all files in the directory (if supported)
    // Note: File System Access API doesn't provide a direct way to list files,
    // so we'll try common patterns based on the current file name
    const currentBaseName = fileName ? fileName.replace(/\.(ttl|turtle|owl|rdf|rdfxml|jsonld|json)$/i, '') : '';
    
    // Try patterns: if current file is "object-props-child-child.ttl" and we're looking for
    // "http://example.org/object-extended", try "object-props-child.ttl", "object-extended.ttl", etc.
    const possibleNames = new Set<string>();
    
    // Pattern 1: Based on current file name (remove one level of hierarchy)
    if (currentBaseName) {
      const patterns = [
        currentBaseName.replace(/-child-child$/, '-child'),
        currentBaseName.replace(/-child$/, '-parent'),
        currentBaseName.replace(/-parent$/, ''),
      ];
      for (const pattern of patterns) {
        for (const ext of rdfExtensions) {
          possibleNames.add(`${pattern}${ext}`);
        }
      }
    }
    
    // Pattern 2: Try to extract from URL
    try {
      const urlObj = new URL(externalUrl);
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      const lastPart = pathParts[pathParts.length - 1] || urlObj.hostname.split('.')[0];
      if (lastPart) {
        for (const ext of rdfExtensions) {
          possibleNames.add(`${lastPart}${ext}`);
        }
      }
    } catch {
      // Invalid URL, skip
    }
    
    // Try each possible file name
    for (const possibleFileName of possibleNames) {
      try {
        const siblingHandle = await parentDir.getFileHandle(possibleFileName);
        const siblingFile = await siblingHandle.getFile();
        const siblingContent = await siblingFile.text();
        
        // Check if this file's ontology base matches the external URL
        const { parseResult: siblingParseResult } = await loadOntologyFromContent(siblingContent, possibleFileName);
        const siblingBase = getMainOntologyBase(siblingParseResult.store);
        const normalizedSiblingBase = siblingBase?.endsWith('#') ? siblingBase.slice(0, -1) : siblingBase;
        const normalizedSiblingBaseNoSlash = normalizedSiblingBase?.replace(/\/$/, '');
        
        if (normalizedSiblingBase === normalizedExternalUrl || 
            normalizedSiblingBaseNoSlash === normalizedExternalUrlNoSlash ||
            normalizedSiblingBase === normalizedExternalUrlNoSlash ||
            normalizedSiblingBaseNoSlash === normalizedExternalUrl) {
          // Found matching local file!
          return {
            content: siblingContent,
            fileName: possibleFileName,
            pathHint: possibleFileName,
            handle: siblingHandle,
          };
        }
      } catch {
        // File doesn't exist or can't be read, try next
        continue;
      }
    }
  } catch {
    // getParent not available or other error
    return null;
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
