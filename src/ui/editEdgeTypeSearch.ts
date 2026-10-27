/**
 * The relationship type search of the edit edge modal, and its sections.
 * Moved out of main.ts (#175).
 */
import { type ExternalObjectPropertyInfo, searchExternalObjectProperties } from '../externalOntologySearch';
import { getMainOntologyBase } from '../parser';
import { editState, session } from '../state/appState';
import { isDebugMode, debugLog } from '../utils/debug';
import { updateEditEdgeCommentDisplayLocal } from './edgeModalHelpers';
import { formatRelationshipLabelWithPrefix } from './externalRefs';
import { getPropertyHasCardinality, hideRelationshipTooltip, getAllEdgeTypes, getRelationshipLabel, getRelationshipComment, showRelationshipTooltip } from './relationshipUtils';

// Wrapper for updateEditEdgeCommentDisplay that updates the DOM
/**
 * Show the cardinality and comment sections that depend on the chosen relationship type. Called as soon as
 * a type is chosen: doing it only when the field lost focus moved the OK button on the mousedown of a click
 * on OK, so the click landed off the button and did nothing (#98).
 */
export function updateEditEdgeTypeSections(): void {
  const cardWrap = document.getElementById('editEdgeCardinalityWrap');
  if (cardWrap && editState.selectedEdgeType) {
    cardWrap.style.display = editState.selectedEdgeType !== 'subClassOf' && getPropertyHasCardinality(editState.selectedEdgeType, session.objectProperties, editState.selectedExternalObjectProperty) ? 'block' : 'none';
  }
  updateEditEdgeCommentDisplayLocal();
}

export async function updateEditEdgeTypeSearch(query: string): Promise<void> {
  const resultsDiv = document.getElementById('editEdgeTypeResults');
  const typeInput = document.getElementById('editEdgeType') as HTMLInputElement;
  if (!resultsDiv || !typeInput) return;
  
  const q = query.toLowerCase().trim();
  if (q.length < 1) {
    resultsDiv.innerHTML = '';
    resultsDiv.style.display = 'none';
    hideRelationshipTooltip();
    editState.selectedEdgeType = null;
    editState.selectedExternalObjectProperty = null;
    updateEditEdgeCommentDisplayLocal();
    return;
  }
  
  // Search local object properties
  const allTypes = getAllEdgeTypes(session.rawData, session.objectProperties);
  const mainBase = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
  const localMatches: Array<{ type: string; label: string; displayLabel: string; comment: string | null; isExternal: boolean; externalProp: ExternalObjectPropertyInfo | null }> = allTypes.filter((t) => {
    const label = getRelationshipLabel(t, session.objectProperties, session.externalOntologyReferences);
    const op = session.objectProperties.find((p) => p.name === t || p.uri === t);
    const displayLabel = formatRelationshipLabelWithPrefix(t, label, session.externalOntologyReferences, op, mainBase);
    return label.toLowerCase().includes(q) || 
           displayLabel.toLowerCase().includes(q) ||
           t.toLowerCase().includes(q);
  }).map((t) => {
    const comment = getRelationshipComment(t, session.objectProperties);
    const op = session.objectProperties.find((p) => p.name === t || p.uri === t);
    const label = getRelationshipLabel(t, session.objectProperties, session.externalOntologyReferences);
    return {
      type: t,
      label: label,
      displayLabel: formatRelationshipLabelWithPrefix(t, label, session.externalOntologyReferences, op, mainBase),
      comment: comment || null,
      isExternal: false,
      externalProp: null as ExternalObjectPropertyInfo | null,
    };
  });
  
  // Search external object properties
  let externalMatches: Array<{ type: string; label: string; displayLabel: string; comment: string | null; isExternal: boolean; externalProp: ExternalObjectPropertyInfo | null }> = [];
  if (session.externalOntologyReferences.length > 0) {
    try {
      // Debug logging (only in debug mode)
      if (isDebugMode()) {
        debugLog(`Searching external object properties for "${query}" across ${session.externalOntologyReferences.length} reference(s):`, session.externalOntologyReferences.map(r => r.url));
      }
      const externalProps = await searchExternalObjectProperties(query, session.externalOntologyReferences);
      // Debug logging (only in debug mode)
      if (isDebugMode()) {
        debugLog(`Found ${externalProps.length} external object properties matching "${query}"`);
      }
      externalMatches = externalProps.map((op) => {
        const displayLabel = op.prefix ? `${op.prefix}: ${op.label}` : op.label;
        // Debug logging (only in debug mode)
        if (isDebugMode()) {
          debugLog(`External property: ${op.uri} -> ${displayLabel}`);
        }
        return {
          type: op.uri, // Use full URI for external properties
          label: op.label,
          displayLabel,
          comment: op.comment || null,
          isExternal: true,
          externalProp: op,
        };
      });
    } catch (err) {
      console.error('Error searching external object properties:', err);
    }
  } else {
    // Debug logging (only in debug mode)
    if (isDebugMode()) {
      debugLog('No external ontology references loaded, skipping external object property search');
    }
  }
  
  // Combine and sort matches (local first, then external)
  const allMatches = [...localMatches, ...externalMatches];
  
  if (allMatches.length === 0) {
    resultsDiv.innerHTML = '<div style="padding: 8px; color: #999;">No matches</div>';
    resultsDiv.style.display = 'block';
    editState.selectedEdgeType = null;
    editState.selectedExternalObjectProperty = null;
  } else if (allMatches.length === 1) {
    // Auto-select single match
    const match = allMatches[0];
    if (match.isExternal && match.externalProp) {
      editState.selectedExternalObjectProperty = match.externalProp;
      editState.selectedEdgeType = match.type; // Store the URI
    } else {
      editState.selectedEdgeType = match.type;
      editState.selectedExternalObjectProperty = null;
    }
    typeInput.value = match.displayLabel;
    updateEditEdgeTypeSections();
    resultsDiv.style.display = 'none';
  } else {
    // Match dropdown width to input field width and align it properly
    // The dropdown is positioned absolutely within the label (which has position: relative)
    // The input field starts after the "Relationship: " text, so we need to align with it
    const labelElement = typeInput.closest('label');
    if (labelElement) {
      // Use getBoundingClientRect to get accurate positioning
      // Then calculate relative to the label
      const labelRect = labelElement.getBoundingClientRect();
      const inputRect = typeInput.getBoundingClientRect();
      
      // Calculate input position relative to label
      const inputLeftRelative = inputRect.left - labelRect.left;
      const inputWidth = inputRect.width;
      
      // Set dropdown width to match input width and position it to align with input
      // Add 60px offset to the right to fix alignment
      resultsDiv.style.width = `${inputWidth}px`;
      resultsDiv.style.left = `${inputLeftRelative + 60}px`;
    } else {
      // Fallback: match input width
      const inputRect = typeInput.getBoundingClientRect();
      resultsDiv.style.width = `${inputRect.width}px`;
      resultsDiv.style.left = '0';
    }
    
    resultsDiv.innerHTML = allMatches.map((match, idx) => {
      const source = match.isExternal ? '<span style="font-size: 9px; color: #999; margin-left: 4px;">(external)</span>' : '';
      const comment = match.comment || '';
      // Add title attribute for native browser tooltip, and data attribute for custom tooltip
      const titleAttr = comment ? `title="${comment.replace(/"/g, '&quot;')}"` : '';
      return `<div class="edit-edge-type-result" data-index="${idx}" data-comment="${comment.replace(/"/g, '&quot;')}" style="padding: 8px; border-bottom: 1px solid #eee; cursor: pointer; position: relative; word-wrap: break-word; overflow-wrap: break-word; white-space: normal;" ${titleAttr}>${match.displayLabel}${source}</div>`;
    }).join('');
    resultsDiv.style.display = 'block';
    
    // Add click handlers and hover tooltips
    resultsDiv.querySelectorAll('.edit-edge-type-result').forEach((el) => {
      const resultEl = el as HTMLElement;
      const idx = parseInt(resultEl.dataset.index || '0', 10);
      const match = allMatches[idx];
      const comment = match.comment;
      
      // Hover handlers for background color and tooltip
      resultEl.addEventListener('mouseenter', () => {
        resultEl.style.background = '#f0f7ff';
        // Show tooltip if comment exists
        if (comment) {
          showRelationshipTooltip(resultEl, comment);
        }
      });
      
      resultEl.addEventListener('mouseleave', () => {
        resultEl.style.background = 'transparent';
        hideRelationshipTooltip();
      });
      
      // Click handler
      resultEl.addEventListener('click', () => {
        if (match.isExternal && match.externalProp) {
          editState.selectedExternalObjectProperty = match.externalProp;
          editState.selectedEdgeType = match.type; // Store the URI
        } else {
          editState.selectedEdgeType = match.type;
          editState.selectedExternalObjectProperty = null;
        }
        typeInput.value = match.displayLabel;
        resultsDiv.style.display = 'none';
        hideRelationshipTooltip();
        updateEditEdgeTypeSections();
      });
    });
  }
}
