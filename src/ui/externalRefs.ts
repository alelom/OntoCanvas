import { Store, DataFactory } from 'n3';
import type { GraphNode } from '../types';
import type { ExternalOntologyReference } from '../storage';
import { saveExternalRefsToIndexedDB } from '../storage';

/**
 * Extract external ontology references from owl:imports statements in the store.
 * We match all quads with predicate owl:imports (any subject) so that imports are found
 * regardless of how the ontology node is represented (e.g. different term identity from parser).
 */
export function extractExternalRefsFromStore(store: Store): ExternalOntologyReference[] {
  const refs: ExternalOntologyReference[] = [];
  const OWL = 'http://www.w3.org/2002/07/owl#';
  const OWL_IMPORTS = OWL + 'imports';

  // Get all owl:imports statements (any subject) so we don't depend on ontology subject matching
  const importQuads = store.getQuads(null, DataFactory.namedNode(OWL_IMPORTS), null, null);
  const seenUrls = new Set<string>();
  for (const quad of importQuads) {
    const importObj = quad.object as { termType: string; value?: string };
    if (importObj.termType === 'NamedNode' && importObj.value) {
      const importUrl = importObj.value;
      if (typeof importUrl === 'string' && (importUrl.startsWith('http://') || importUrl.startsWith('https://'))) {
        const urlWithoutHash = importUrl.endsWith('#') ? importUrl.slice(0, -1) : importUrl;
        if (seenUrls.has(urlWithoutHash)) continue;
        seenUrls.add(urlWithoutHash);

        // Try common prefixes based on URL patterns (so imported properties show e.g. geo:hasGeometry in the UI)
        let prefix: string | undefined;
        if (urlWithoutHash.includes('w3id.org/dano')) {
          prefix = 'dano';
        } else if (urlWithoutHash.includes('schema.org')) {
          prefix = 'schema';
        } else if (urlWithoutHash.includes('purl.org/dc')) {
          prefix = 'dc';
        } else if (urlWithoutHash.includes('opengis.net/ont/geosparql')) {
          prefix = 'geo';
        }

        const url = importUrl.endsWith('#') ? importUrl : importUrl.replace(/\/$/, '');
        refs.push({
          url,
          usePrefix: prefix !== undefined,
          prefix: prefix,
        });
      }
    }
  }

  return refs;
}

/** Core W3C namespaces we do not show as external refs (always present). */
const CORE_NAMESPACES = new Set([
  'http://www.w3.org/1999/02/22-rdf-syntax-ns',
  'http://www.w3.org/2000/01/rdf-schema',
  'http://www.w3.org/2002/07/owl',
  'http://www.w3.org/2001/XMLSchema',
]);

/** Non-vocabulary: identifiers, licenses, docs, people pages, source repos. Never show as external ontology refs. */
function isNonVocabularyNamespace(normalized: string): boolean {
  const n = normalized.toLowerCase();
  if (n.length < 12) return true;
  if (!/^https?:\/\/[^/?#]+/.test(normalized)) return true;
  if (n.includes('orcid.org')) return true;
  if (n.includes('creativecommons.org')) return true;
  if (n.includes('ruhr-uni-bochum.de') || n.includes('inf.bi.')) return true;
  if (n.includes('opengis.net/doc/') || n.includes('opengis.net/def/')) return true;
  if (n.includes('github.com')) return true;
  if (n.includes('ietf.org')) return true;
  return false;
}

/** Map to canonical vocabulary namespace (one ref per vocabulary, correct URL). */
function toCanonicalVocabularyNamespace(normalized: string): string {
  if (
    normalized === 'http://www.opengis.net/ont' ||
    (normalized.includes('opengis.net') && (normalized.includes('/ont/geosparql') || normalized.includes('/doc/') || normalized.includes('/def/')))
  )
    return 'http://www.opengis.net/ont/geosparql';
  if (normalized === 'http://purl.org/dc/elements' || normalized.startsWith('http://purl.org/dc/elements/'))
    return 'http://purl.org/dc/elements/1.1';
  return normalized;
}

/**
 * Extract external ontology references from namespaces actually used in the store.
 * Use when the ontology has no owl:imports (e.g. RDF/XML or TTL without imports) so the
 * "Manage External Ontology References" modal still shows used vocabularies (dc, geo, schema, etc.).
 * Excludes non-vocabulary IRIs (ORCID, licenses, institutional pages, spec docs) and
 * consolidates GeoSPARQL-related namespaces to the canonical ontology IRI.
 */
export function extractUsedNamespaceRefsFromStore(
  store: Store,
  mainOntologyBase: string | null
): ExternalOntologyReference[] {
  const refs: ExternalOntologyReference[] = [];
  const seen = new Set<string>();
  const mainNormalized = mainOntologyBase
    ? (mainOntologyBase.endsWith('#') ? mainOntologyBase.slice(0, -1) : mainOntologyBase).replace(/\/$/, '')
    : '';

  function addNamespace(iri: string): void {
    if (!iri || (!iri.startsWith('http://') && !iri.startsWith('https://'))) return;
    const ns = iri.includes('#')
      ? iri.slice(0, iri.indexOf('#') + 1)
      : iri.replace(/\/?[^/]*\/?$/, '/') || iri + '/';
    let normalized = (ns.endsWith('#') ? ns.slice(0, -1) : ns).replace(/\/$/, '');
    normalized = toCanonicalVocabularyNamespace(normalized);
    if (seen.has(normalized)) return;
    if (normalized === mainNormalized) return;
    if (CORE_NAMESPACES.has(normalized)) return;
    if (isNonVocabularyNamespace(normalized)) return;
    seen.add(normalized);
    const url = iri.includes('#') ? normalized + '#' : normalized;
    let prefix: string | undefined;
    if (normalized.includes('w3id.org/dano')) prefix = 'dano';
    else if (normalized.includes('schema.org')) prefix = 'schema';
    else if (normalized.includes('purl.org/dc')) prefix = 'dc';
    else if (normalized.includes('opengis.net/ont/geosparql')) prefix = 'geo';
    else if (normalized.includes('xmlns.com/foaf')) prefix = 'foaf';
    else if (normalized.includes('skos/core')) prefix = 'skos';
    else if (normalized.includes('vocab/vann')) prefix = 'vann';
    refs.push({ url, usePrefix: prefix !== undefined, prefix });
  }

  for (const q of store) {
    if (q.subject.termType === 'NamedNode' && (q.subject as { value?: string }).value)
      addNamespace((q.subject as { value: string }).value);
    if (q.predicate.termType === 'NamedNode' && (q.predicate as { value?: string }).value)
      addNamespace((q.predicate as { value: string }).value);
    if (q.object.termType === 'NamedNode' && (q.object as { value?: string }).value)
      addNamespace((q.object as { value: string }).value);
  }

  return refs;
}

/**
 * Extract prefix declarations from TTL string
 */
export function extractPrefixesFromTtl(ttlString: string): Record<string, string> {
  const prefixMap: Record<string, string> = {};
  // Match @prefix prefixName: <url> .
  const prefixPattern = /@prefix\s+(\w+)\s*:\s*<([^>]+)>\s*\./g;
  let match;
  while ((match = prefixPattern.exec(ttlString)) !== null) {
    const prefix = match[1];
    const url = match[2];
    prefixMap[prefix] = url;
  }
  return prefixMap;
}

/**
 * Extract ontology URL from a node comment that contains "(Imported from ...)"
 */
export function getNodeOntologyUrl(node: GraphNode): string | null {
  if (!node.comment) return null;
  const match = node.comment.match(/\(Imported from ([^)]+)\)/);
  return match ? match[1] : null;
}

/**
 * Get prefix for a node if it's from an external ontology
 */
export function getNodePrefix(
  node: GraphNode,
  externalOntologyReferences: ExternalOntologyReference[]
): string | null {
  const ontologyUrl = getNodeOntologyUrl(node);
  if (!ontologyUrl) return null;
  const ref = externalOntologyReferences.find((r) => {
    const refUrl = r.url.endsWith('#') ? r.url.slice(0, -1) : r.url;
    const nodeUrl = ontologyUrl.endsWith('#') ? ontologyUrl.slice(0, -1) : ontologyUrl;
    return refUrl === nodeUrl;
  });
  return ref?.usePrefix && ref.prefix ? ref.prefix : null;
}

/**
 * Get prefix for an object property if it's from an external ontology
 * Object properties from external ontologies would have their URI stored in the name
 */
export function getObjectPropertyPrefix(
  propertyName: string,
  externalOntologyReferences: ExternalOntologyReference[]
): string | null {
  // Check if property name is a full URI
  if (!propertyName.startsWith('http://') && !propertyName.startsWith('https://')) {
    return null;
  }
  // Find matching external reference
  for (const ref of externalOntologyReferences) {
    const refUrl = ref.url.endsWith('#') ? ref.url.slice(0, -1) : ref.url;
    if (propertyName.startsWith(refUrl) || propertyName.startsWith(refUrl + '#')) {
      return ref.usePrefix && ref.prefix ? ref.prefix : null;
    }
  }
  // Fallback: known namespaces when no ref (e.g. inlined without owl:imports)
  if (propertyName.includes('opengis.net/ont/geosparql')) return 'geo';
  if (propertyName.includes('w3.org/1999/02/22-rdf-syntax-ns#')) return 'rdf';
  if (propertyName.includes('w3.org/2000/01/rdf-schema#')) return 'rdfs';
  if (propertyName.includes('w3.org/2002/07/owl#')) return 'owl';
  return null;
}

/**
 * Format node label with prefix if available
 */
export function formatNodeLabelWithPrefix(
  node: GraphNode,
  externalOntologyReferences: ExternalOntologyReference[]
): string {
  const prefix = getNodePrefix(node, externalOntologyReferences);
  if (prefix) {
    // Extract local name from node ID or label
    const localName = node.id.includes(':') ? node.id.split(':').pop() || node.id : node.id;
    return `${prefix}: ${node.label}`;
  }
  return node.label;
}

/**
 * Format relationship label with prefix if available
 */
export function formatRelationshipLabelWithPrefix(
  propertyName: string,
  label: string,
  externalOntologyReferences: ExternalOntologyReference[]
): string {
  const prefix = getObjectPropertyPrefix(propertyName, externalOntologyReferences);
  if (prefix) {
    // Extract local name from property name
    const localName = propertyName.includes('#') 
      ? propertyName.split('#').pop() || propertyName
      : propertyName.includes('/')
      ? propertyName.split('/').pop() || propertyName
      : propertyName;
    return `${prefix}: ${label}`;
  }
  return label;
}

/**
 * Callbacks interface for external refs modal
 */
/**
 * Sort external refs by URL (alphabetically) in place.
 */
export function sortExternalRefsByUrl(refs: ExternalOntologyReference[]): void {
  refs.sort((a, b) => a.url.localeCompare(b.url));
}

export interface ExternalRefsModalCallbacks {
  onUpdate: () => void;
  onSave: () => void;
}

/**
 * Render the external references list
 */
export function renderExternalRefsList(
  externalOntologyReferences: ExternalOntologyReference[],
  callbacks: ExternalRefsModalCallbacks,
  loadedFilePath: string | null,
  loadedFileName: string | null
): void {
  const listEl = document.getElementById('externalRefsList');
  if (!listEl) return;
  
  if (externalOntologyReferences.length === 0) {
    listEl.innerHTML = '<p style="font-size: 12px; color: #666; text-align: center; padding: 20px;">No external ontology references added yet.</p>';
    return;
  }
  
  listEl.innerHTML = externalOntologyReferences.map((ref, index) => {
    const urlDisplay = ref.url.length > 60 ? ref.url.substring(0, 60) + '...' : ref.url;
    return `
      <div style="display: flex; align-items: center; gap: 12px; padding: 10px; margin-bottom: 8px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">
        <div style="flex: 1;">
          <a href="${ref.url}" target="_blank" rel="noopener noreferrer" style="font-size: 12px; color: #3498db; text-decoration: none; word-break: break-all;" title="${ref.url}">${urlDisplay}</a>
          <div style="margin-top: 6px; display: flex; align-items: center; gap: 8px;">
            <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; cursor: pointer;">
              <input type="checkbox" class="external-ref-use-prefix" data-index="${index}" ${ref.usePrefix ? 'checked' : ''}>
              Use prefix
            </label>
            ${ref.usePrefix ? `
              <input type="text" class="external-ref-prefix" data-index="${index}" value="${ref.prefix || ''}" placeholder="prefix name" style="padding: 4px 6px; font-size: 11px; width: 100px; border: 1px solid #ccc; border-radius: 4px;">
            ` : ''}
          </div>
        </div>
        <button type="button" class="external-ref-delete" data-index="${index}" style="padding: 4px 8px; font-size: 11px; color: #c0392b; background: none; border: 1px solid #c0392b; border-radius: 4px; cursor: pointer;">Delete</button>
      </div>
    `;
  }).join('');
  
  // Add event listeners
  listEl.querySelectorAll('.external-ref-use-prefix').forEach((cb) => {
    (cb as HTMLElement).addEventListener('change', ((e: Event) => {
      const index = parseInt((e.target as HTMLElement).dataset.index || '0', 10);
      externalOntologyReferences[index].usePrefix = (e.target as HTMLInputElement).checked;
      renderExternalRefsList(externalOntologyReferences, callbacks, loadedFilePath, loadedFileName);
      saveExternalRefsToIndexedDB(externalOntologyReferences, loadedFilePath, loadedFileName).catch(() => {});
      callbacks.onUpdate();
      callbacks.onSave();
    }) as EventListener);
  });
  
  listEl.querySelectorAll('.external-ref-prefix').forEach((input) => {
    (input as HTMLElement).addEventListener('change', ((e: Event) => {
      const index = parseInt((e.target as HTMLElement).dataset.index || '0', 10);
      externalOntologyReferences[index].prefix = (e.target as HTMLInputElement).value.trim() || undefined;
      saveExternalRefsToIndexedDB(externalOntologyReferences, loadedFilePath, loadedFileName).catch(() => {});
      callbacks.onUpdate();
      callbacks.onSave();
    }) as EventListener);
  });
  
  listEl.querySelectorAll('.external-ref-delete').forEach((btn) => {
    (btn as HTMLElement).addEventListener('click', ((e: Event) => {
      const index = parseInt((e.target as HTMLElement).dataset.index || '0', 10);
      externalOntologyReferences.splice(index, 1);
      renderExternalRefsList(externalOntologyReferences, callbacks, loadedFilePath, loadedFileName);
      saveExternalRefsToIndexedDB(externalOntologyReferences, loadedFilePath, loadedFileName).catch(() => {});
      callbacks.onUpdate();
      callbacks.onSave();
    }) as EventListener);
  });
}

/**
 * Show the external references modal
 */
export function showExternalRefsModal(
  externalOntologyReferences: ExternalOntologyReference[],
  callbacks: ExternalRefsModalCallbacks,
  loadedFilePath: string | null,
  loadedFileName: string | null
): void {
  const modal = document.getElementById('externalRefsModal');
  if (!modal) return;
  renderExternalRefsList(externalOntologyReferences, callbacks, loadedFilePath, loadedFileName);
  modal.style.display = 'flex';
}

/**
 * Hide the external references modal
 */
export function hideExternalRefsModal(): void {
  const modal = document.getElementById('externalRefsModal');
  if (modal) modal.style.display = 'none';
}
