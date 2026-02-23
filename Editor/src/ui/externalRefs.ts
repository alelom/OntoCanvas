import { Store, DataFactory } from 'n3';
import type { GraphNode } from '../types';
import type { ExternalOntologyReference } from '../storage';
import { saveExternalRefsToIndexedDB } from '../storage';
import { extractLocalName } from '../parser';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const OWL = 'http://www.w3.org/2002/07/owl#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';

/**
 * Extract external ontology references from owl:imports statements in the store
 */
export function extractExternalRefsFromStore(store: Store): ExternalOntologyReference[] {
  const refs: ExternalOntologyReference[] = [];
  const OWL_IMPORTS = OWL + 'imports';
  
  // Find ontology declaration
  const ontologyQuads = store.getQuads(null, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Ontology'), null);
  
  if (ontologyQuads.length === 0) {
    return refs;
  }
  
  const ontologySubject = ontologyQuads[0].subject;
  
  // Get owl:imports statements
  const importQuads = store.getQuads(ontologySubject, DataFactory.namedNode(OWL_IMPORTS), null, null);
  for (const quad of importQuads) {
    const importObj = quad.object as { termType: string; value?: string };
    if (importObj.termType === 'NamedNode' && importObj.value) {
      const importUrl = importObj.value;
      if (typeof importUrl === 'string' && (importUrl.startsWith('http://') || importUrl.startsWith('https://'))) {
        // Try to find prefix from URL patterns
        const urlWithoutHash = importUrl.endsWith('#') ? importUrl.slice(0, -1) : importUrl;
        
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
        
        refs.push({
          url: importUrl,
          usePrefix: prefix !== undefined,
          prefix: prefix,
        });
      }
    }
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
 * Format node identifier with prefix if available
 */
export function formatNodeIdentifierWithPrefix(
  node: GraphNode,
  externalOntologyReferences: ExternalOntologyReference[]
): string {
  const prefix = getNodePrefix(node, externalOntologyReferences);
  if (prefix) {
    return `${prefix}:${node.id}`;
  }
  return node.id;
}

/**
 * Get node label for a specific language, with fallback to 'en', then to identifier.
 * Requires store to query language-tagged labels.
 */
export function getNodeLabelForLanguage(
  node: GraphNode,
  language: string,
  externalOntologyReferences: ExternalOntologyReference[],
  store: Store | null
): string {
  if (!store) {
    // Fallback to node.label if no store
    return formatNodeLabelWithPrefix(node, externalOntologyReferences);
  }
  
  // Get node URI - need to find it from the store
  const classQuads = store.getQuads(null, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Class'), null);
  let nodeUri: string | null = null;
  for (const q of classQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    const localName = extractLocalName(subj.value);
    if (localName === node.id) {
      nodeUri = subj.value;
      break;
    }
  }
  
  if (!nodeUri) {
    // Fallback to node.label if URI not found
    return formatNodeLabelWithPrefix(node, externalOntologyReferences);
  }
  
  const subject = DataFactory.namedNode(nodeUri);
  const labelPred = DataFactory.namedNode(RDFS + 'label');
  
  // Try to get label for requested language
  const labelQuads = store.getQuads(subject, labelPred, null, null);
  for (const quad of labelQuads) {
    const object = quad.object;
    if (object.termType === 'Literal') {
      const literal = object as { value: string; language?: string };
      if (literal.language === language) {
        return formatNodeLabelWithPrefix({ ...node, label: literal.value }, externalOntologyReferences);
      }
    }
  }
  
  // Fallback to 'en' if requested language not found
  if (language !== 'en') {
    for (const quad of labelQuads) {
      const object = quad.object;
      if (object.termType === 'Literal') {
        const literal = object as { value: string; language?: string };
        if (literal.language === 'en' || !literal.language) {
          return formatNodeLabelWithPrefix({ ...node, label: literal.value }, externalOntologyReferences);
        }
      }
    }
  }
  
  // Fallback to identifier
  return formatNodeIdentifierWithPrefix(node, externalOntologyReferences);
}

/**
 * Callbacks interface for external refs modal
 */
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
