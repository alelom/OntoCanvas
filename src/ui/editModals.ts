/**
 * The edit edge modal, and opening the edit modal for a node or an edge.
 * Moved out of main.ts (#175).
 */
import { edgeLock } from '../lib/edgeEditability';
import { getMainOntologyBase } from '../parser';
import { session, editState } from '../state/appState';
import type { GraphEdge } from '../types';
import { debugWarn, debugError, debugLog } from '../utils/debug';
import { parseEdgeId } from '../utils/edgeId';
import { showEditDataPropertyModal } from './dataPropertyModals';
import { hideEditEdgeModalWithCleanup, updateEditEdgeCommentDisplayLocal } from './edgeModalHelpers';
import { showEditEdgeClassExpressionNotice, findClassExpressionGroupForEdge } from './editEdgeClassExpressionNotice';
import { showEditEdgeRestrictionNotice } from './editEdgeRestrictionNotice';
import { formatNodeLabelWithPrefix, formatRelationshipLabelWithPrefix } from './externalRefs';
import { getRelationshipLabel } from './relationshipUtils';
import { showRenameModal } from './renameModal';

/** Open the appropriate edit modal for a node (class rename, data property restriction, or normal data property). */
export function openEditModalForNode(nodeId: string): void {
  // Handle data property restriction nodes
  if (nodeId.startsWith('__dataproprestrict__')) {
    const match = nodeId.match(/^__dataproprestrict__(.+)__(.+)$/);
    if (match) {
      const [, classId] = match;
      showEditEdgeModal(nodeId, classId, 'dataprop');
      return;
    }
  }
  // Handle normal data property nodes (not restrictions)
  if (nodeId.startsWith('__dataprop__')) {
    const match = nodeId.match(/^__dataprop__(.+)__(.+)$/);
    if (match) {
      const [, , propertyName] = match;
      showEditDataPropertyModal(propertyName);
      return;
    }
  }
  // Handle regular class nodes
  const node = session.rawData.nodes.find((n) => n.id === nodeId);
  if (node) {
    showRenameModal(nodeId, node.label, node.labellableRoot);
  }
}

/** Open the appropriate edit modal for an edge (object property or data property). Normalizes dataproprestrict -> dataprop. */
export function openEditModalForEdge(edgeId: string): void {
  const parsed = parseEdgeId(edgeId);
  if (!parsed) return;
  const { from, to, type } = parsed;
  const edgeType = type === 'dataproprestrict' || type === 'dataprop' ? 'dataprop' : type;

  // For data property edges, extract the property name and open the data property modal
  // Edge direction: classId -> dataProp.id (arrow points to range type node)
  if (edgeType === 'dataprop') {
    // Parse the 'to' node ID to extract property name (since arrow now points to the data property node)
    // Pattern: __dataproprestrict__${classId}__${propertyName} or __dataprop__${classId}__${propertyName}
    let match = to.match(/^__dataproprestrict__(.+)__(.+)$/);
    if (!match) {
      match = to.match(/^__dataprop__(.+)__(.+)$/);
    }
    if (match) {
      const [, , propertyName] = match;
      showEditDataPropertyModal(propertyName);
      return;
    }
  }

  showEditEdgeModal(from, to, edgeType);
}

export function showEditEdgeModal(edgeFrom: string, edgeTo: string, edgeType: string): void {
  const modal = document.getElementById('editEdgeModal');
  if (!modal) {
    console.error('[showEditEdgeModal] editEdgeModal element not found!');
    return;
  }
  const fromSel = document.getElementById('editEdgeFrom') as HTMLSelectElement;
  const toSel = document.getElementById('editEdgeTo') as HTMLSelectElement;
  const cardWrap = document.getElementById('editEdgeCardinalityWrap')!;
  const minCardInput = document.getElementById('editEdgeMinCard') as HTMLInputElement;
  const maxCardInput = document.getElementById('editEdgeMaxCard') as HTMLInputElement;

  // Cleared up-front; each branch re-shows it if this edge's domain belongs to a union (owl:unionOf).
  showEditEdgeClassExpressionNotice(modal, null);
  // Likewise the restriction detail, which also unlocks a form a read-only restriction locked (#63).
  showEditEdgeRestrictionNotice(modal, null, '');

  const isDataPropertyEdge = edgeType === 'dataprop';

  if (isDataPropertyEdge) {
    // For data property edges, parse the data property node ID to get the class and property
    // Handle both restriction nodes (__dataproprestrict__) and generic property nodes (__dataprop__)
    let match = edgeFrom.match(/^__dataproprestrict__(.+)__(.+)$/);
    if (!match) {
      match = edgeFrom.match(/^__dataprop__(.+)__(.+)$/);
      // For normal data properties (not restrictions), open the "Edit Data Property" modal instead
      if (match) {
        const [, , propertyName] = match;
        hideEditEdgeModalWithCleanup();
        showEditDataPropertyModal(propertyName);
        return;
      }
      hideEditEdgeModalWithCleanup();
      return;
    }
    const [, classId, propertyName] = match;

    showEditEdgeClassExpressionNotice(modal, findClassExpressionGroupForEdge(session.rawData.classExpressions, classId, classId, propertyName));

    modal.dataset.mode = 'edit';
    modal.dataset.oldFrom = edgeFrom;
    modal.dataset.oldTo = edgeTo;
    modal.dataset.oldType = edgeType;
    modal.dataset.dataPropertyName = propertyName;
    modal.dataset.classId = classId;
    
    const classNode = session.rawData.nodes.find((n) => n.id === classId);
    const restriction = classNode?.dataPropertyRestrictions?.find((r) => r.propertyName === propertyName);
    
    // For data properties, show the data property name and class, but disable editing
    fromSel.disabled = true;
    toSel.disabled = true;
    const typeInput = document.getElementById('editEdgeType') as HTMLInputElement;
    if (typeInput) {
      typeInput.disabled = true;
      typeInput.value = 'dataprop (data property)';
      editState.selectedEdgeType = 'dataprop';
      editState.selectedExternalObjectProperty = null;
    }
    
    // Constrain select widths to prevent modal from expanding too wide
    fromSel.style.maxWidth = '350px';
    toSel.style.maxWidth = '350px';
    if (typeInput) {
      typeInput.style.maxWidth = '350px';
    }
    // Also constrain the modal content width
    const modalContent = modal.querySelector('.modal-content') as HTMLElement;
    if (modalContent) {
      modalContent.style.maxWidth = '400px';
      modalContent.style.width = '400px';
    }
    
    // Show data property node label and class node label
    const dp = session.dataProperties.find((p) => p.name === propertyName);
    const dpLabel = dp?.label ?? propertyName;
    fromSel.innerHTML = `<option value="${edgeFrom}" selected>${dpLabel} (data property)</option>`;
    toSel.innerHTML = session.rawData.nodes.map((n) => `<option value="${n.id}"${n.id === edgeTo ? ' selected' : ''}>${n.label}</option>`).join('');
    
    
    // Show cardinality for data properties
    minCardInput.value = restriction?.minCardinality != null ? String(restriction.minCardinality) : '';
    maxCardInput.value = restriction?.maxCardinality != null ? String(restriction.maxCardinality) : '';
    cardWrap.style.display = 'block';
    
    // Show explanation for disabled fields
    let explanationEl = document.getElementById('editEdgeDataPropExplanation');
    if (!explanationEl) {
      explanationEl = document.createElement('div');
      explanationEl.id = 'editEdgeDataPropExplanation';
      explanationEl.style.cssText = 'font-size: 11px; color: #666; margin-top: 4px; margin-bottom: 4px; padding: 6px 8px; background: #f0f0f0; border-radius: 4px; line-height: 1.4; width: 100%; box-sizing: border-box; word-wrap: break-word; overflow-wrap: break-word;';
      // Insert after the "To" field, before the cardinality section
      const toSelParent = toSel.parentElement;
      if (toSelParent && toSelParent.parentElement) {
        toSelParent.parentElement.insertBefore(explanationEl, cardWrap);
      }
    }
    const classNodeLabel = classNode?.label ?? classId;
    explanationEl.textContent = `Note: To change which data property, edit the source node (double-click the class node ${classNodeLabel})`;
    explanationEl.style.display = 'block';
    
    // Hide comment display for data properties (or show data property comment)
    const commentEl = document.getElementById('editEdgeComment') as HTMLElement;
    if (commentEl) {
      if (dp?.comment) {
        commentEl.textContent = dp.comment;
        commentEl.style.display = 'block';
      } else {
        commentEl.style.display = 'none';
      }
    }
    
    modal.querySelector('h3')!.textContent = 'Edit data property restriction';
  } else {
    // Regular object property edge
    // Find all matching edges first
    const isThisEdge = (e: GraphEdge) => e.from === edgeFrom && e.to === edgeTo && e.type === edgeType;
    let allMatchingEdges = session.rawData.edges.filter(isThisEdge);
    // An edge only the external expansion draws (#99)
    if (allMatchingEdges.length === 0) allMatchingEdges = session.currentGraphDataForBuild?.edges.filter(isThisEdge) ?? [];
    
    // ALWAYS prioritize restriction edges - they have the actual cardinality constraints
    let edge = allMatchingEdges.find((e) => e.isRestriction === true);
    if (!edge && allMatchingEdges.length > 0) {
      // Fall back to any matching edge if no restriction edge found
      edge = allMatchingEdges[0];
      debugWarn('[DEBUG] No restriction edge found, using fallback:', {
        edgeFrom,
        edgeTo,
        edgeType,
        allMatchingEdges,
        selectedEdge: edge,
      });
    } else if (!edge) {
      debugError('[DEBUG] No matching edge found at all:', {
        edgeFrom,
        edgeTo,
        edgeType,
        allEdgesWithType: session.rawData.edges.filter((e) => e.type === edgeType).slice(0, 5),
      });
    }
    
    // Debug: Log edge lookup - ALWAYS log, not just when multiple edges
    debugLog('[DEBUG] Edge lookup result:', {
      edgeFrom,
      edgeTo,
      edgeType,
      allMatchingEdgesCount: allMatchingEdges.length,
      allMatchingEdges,
      selectedEdge: edge,
      selectedEdgeIsRestriction: edge?.isRestriction,
      selectedEdgeMinCard: edge?.minCardinality,
      selectedEdgeMaxCard: edge?.maxCardinality,
    });

    modal.dataset.mode = 'edit';
    modal.dataset.oldFrom = edgeFrom;
    modal.dataset.oldTo = edgeTo;
    modal.dataset.oldType = edgeType;
    delete modal.dataset.dataPropertyName;
    delete modal.dataset.classId;
    
    fromSel.disabled = false;
    toSel.disabled = false;
    const typeInputEdit = document.getElementById('editEdgeType') as HTMLInputElement;
    if (typeInputEdit) {
      typeInputEdit.disabled = false;
    }
    
    // Reset max-width for regular edges (let them size naturally)
    fromSel.style.maxWidth = '';
    toSel.style.maxWidth = '';
    if (typeInputEdit) {
      typeInputEdit.style.maxWidth = '';
    }
    const modalContent = modal.querySelector('.modal-content') as HTMLElement;
    if (modalContent) {
      modalContent.style.maxWidth = '';
    }
    
    const nodesForDropdown = session.currentGraphDataForBuild?.nodes ?? session.rawData.nodes;
    fromSel.innerHTML = nodesForDropdown.map((n) => `<option value="${n.id}"${n.id === edgeFrom ? ' selected' : ''}>${formatNodeLabelWithPrefix(n, session.externalOntologyReferences)}</option>`).join('');
    toSel.innerHTML = nodesForDropdown.map((n) => `<option value="${n.id}"${n.id === edgeTo ? ' selected' : ''}>${formatNodeLabelWithPrefix(n, session.externalOntologyReferences)}</option>`).join('');
    if (typeInputEdit) {
      const label = getRelationshipLabel(edgeType, session.objectProperties, session.externalOntologyReferences);
      // Find property by name, URI, or full URI string (edgeType might be local name or full URI for imported properties)
      // Try multiple matching strategies:
      // 1. Exact match by name
      // 2. Exact match by URI
      // 3. If edgeType is a local name, check if any property's URI ends with it
      // 4. If edgeType is a full URI, check if any property's URI matches it
      let op = session.objectProperties.find((p) => p.name === edgeType || p.uri === edgeType);
      if (!op && !edgeType.startsWith('http')) {
        // edgeType is likely a local name, try to find by URI ending
        op = session.objectProperties.find((p) => {
          if (!p.uri) return false;
          const uriLocalName = p.uri.includes('#') ? p.uri.split('#').pop() : p.uri.split('/').pop();
          return uriLocalName === edgeType || p.uri.endsWith('#' + edgeType) || p.uri.endsWith('/' + edgeType);
        });
      }
      if (!op && edgeType.startsWith('http')) {
        // edgeType is a full URI, try to find by URI matching
        op = session.objectProperties.find((p) => {
          if (!p.uri) return false;
          return p.uri === edgeType || edgeType.includes(p.uri) || p.uri.includes(edgeType);
        });
      }
      const mainBase = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
      const displayLabel = formatRelationshipLabelWithPrefix(edgeType, label, session.externalOntologyReferences, op, mainBase);
      typeInputEdit.value = displayLabel;
      editState.selectedEdgeType = edgeType;
      editState.selectedExternalObjectProperty = null;
    }

    // Debug: Log edge lookup for troubleshooting
    debugLog('[DEBUG] showEditEdgeModal - edge lookup:', {
      edgeFrom,
      edgeTo,
      edgeType,
      foundEdge: edge,
      allMatchingEdges: session.rawData.edges.filter((e) => e.from === edgeFrom && e.to === edgeTo && e.type === edgeType),
    });
    
    // Set cardinality values - handle null/undefined correctly
    if (edge?.minCardinality != null && edge.minCardinality !== undefined) {
      minCardInput.value = String(edge.minCardinality);
    } else {
      minCardInput.value = '';
    }
    if (edge?.maxCardinality != null && edge.maxCardinality !== undefined) {
      maxCardInput.value = String(edge.maxCardinality);
    } else {
      maxCardInput.value = '';
    }
    
    // Set isRestriction checkbox - check if this is a restriction edge
    const isRestrictionCb = document.getElementById('editEdgeIsRestriction') as HTMLInputElement;
    if (isRestrictionCb) {
      // Check if this is a restriction edge - prioritize explicit isRestriction flag
      const isRestriction = edge?.isRestriction === true;
      isRestrictionCb.checked = isRestriction;
      debugLog('[DEBUG] showEditEdgeModal - restriction checkbox:', {
        isRestriction,
        edgeIsRestriction: edge?.isRestriction,
        minCardinality: edge?.minCardinality,
        maxCardinality: edge?.maxCardinality,
        edgeType,
      });
    }
    
    // Show cardinality section only if this is a restriction (cardinality only makes sense for restrictions)
    cardWrap.style.display = isRestrictionCb?.checked === true ? 'block' : 'none';

    // Locked from where the parser drew the edge, not from whether a mark is drawn for it (#58).
    const propertyLabel = getRelationshipLabel(edgeType, session.objectProperties, session.externalOntologyReferences);
    const lock = edge ? edgeLock(edge) : null;
    const lockedByExpression = lock === 'classExpression';
    showEditEdgeClassExpressionNotice(
      modal,
      findClassExpressionGroupForEdge(session.rawData.classExpressions, edgeFrom, edgeTo, edgeType),
      lockedByExpression ? propertyLabel : undefined,
    );
    showEditEdgeRestrictionNotice(modal, edge ?? null, propertyLabel, lockedByExpression || lock === 'externalTarget');

    updateEditEdgeCommentDisplayLocal();
    modal.querySelector('h3')!.textContent = 'Edit edge';

    // Hide explanation for regular edges
    const explanationEl = document.getElementById('editEdgeDataPropExplanation');
    if (explanationEl) {
      explanationEl.style.display = 'none';
    }
  }
  
  modal.style.display = 'flex';
}
