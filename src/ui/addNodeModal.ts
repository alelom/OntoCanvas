/**
 * The add node modal: opening it, and searching referenced ontologies for an external class.
 * Moved out of main.ts (#175).
 */
import { getReferencedExternalClassesFromStore, type ExternalClassInfo, getStubExternalClassForUri, searchExternalClasses } from '../externalOntologySearch';
import { getMainOntologyBase } from '../ontology/ontologyBase';
import { editState, session } from '../state/appState';
import { isDebugMode, debugLog } from '../utils/debug';
import { buildAnnotationPropsDeps } from '../workflows/propertyLists';
import * as nodeModalFormUi from './nodeModalFormUi';
import { onRemoveAddNodeDataProp, refreshAddNodeOkButton } from './nodeModalHelpers';

export function showAddNodeModal(canvasX: number, canvasY: number): void {
  editState.pendingAddNodePosition = { x: canvasX, y: canvasY };
  editState.addNodeModalShowing = true;
  const modal = document.getElementById('addNodeModal')!;
  const customInput = document.getElementById('addNodeInput') as HTMLInputElement;
  const externalInput = document.getElementById('addNodeExternalInput') as HTMLInputElement;
  const okBtn = document.getElementById('addNodeConfirm') as HTMLButtonElement;
  const externalTabBtn = document.getElementById('addNodeExternalTabBtn');
  const externalTabContent = document.getElementById('addNodeExternalTabContent');
  const customTabContent = document.getElementById('addNodeCustomTab');
  
  // Show/hide external tab based on whether we have external references
  if (externalTabBtn && session.externalOntologyReferences.length > 0) {
    externalTabBtn.style.display = '';
  } else if (externalTabBtn) {
    externalTabBtn.style.display = 'none';
  }
  
  // Reset to custom tab
  document.querySelectorAll('.add-node-tab').forEach((tab) => {
    (tab as HTMLElement).classList.remove('active');
    (tab as HTMLElement).style.borderBottomColor = 'transparent';
    (tab as HTMLElement).style.fontWeight = 'normal';
    (tab as HTMLElement).style.color = '#666';
  });
  const customTabBtn = document.querySelector('.add-node-tab[data-tab="custom"]') as HTMLElement;
  if (customTabBtn) {
    customTabBtn.classList.add('active');
    customTabBtn.style.borderBottomColor = '#3498db';
    customTabBtn.style.fontWeight = 'bold';
    customTabBtn.style.color = '#000';
  }
  
  if (customTabContent) customTabContent.style.display = 'block';
  if (externalTabContent) externalTabContent.style.display = 'none';
  
  if (customInput) customInput.value = '';
  if (externalInput) externalInput.value = '';
  const addNodeComment = document.getElementById('addNodeComment') as HTMLTextAreaElement;
  if (addNodeComment) addNodeComment.value = '';
  const dupErr = document.getElementById('addNodeDuplicateError') as HTMLElement;
  const extDupErr = document.getElementById('addNodeExternalDuplicateError') as HTMLElement;
  if (dupErr) { dupErr.style.display = 'none'; dupErr.textContent = ''; }
  if (extDupErr) { extDupErr.style.display = 'none'; extDupErr.textContent = ''; }
  editState.addNodeAnnotationValues = {};
  editState.addNodeDataPropertyRestrictions = [];
  const addNodeAnnotationPropsSection = document.getElementById('addNodeAnnotationPropsSection');
  if (addNodeAnnotationPropsSection) {
    if (session.annotationProperties.length === 0) {
      addNodeAnnotationPropsSection.style.display = 'none';
    } else {
      addNodeAnnotationPropsSection.style.display = 'block';
      editState.addNodeAnnotationValues = {};
      nodeModalFormUi.renderAddNodeAnnotationPropsList(
        session.annotationProperties,
        buildAnnotationPropsDeps(null, editState.addNodeAnnotationValues)
      );
    }
  }
  const addNodeDataPropsSection = document.getElementById('addNodeDataPropsSection');
  if (addNodeDataPropsSection) {
    if (session.dataProperties.length === 0) {
      addNodeDataPropsSection.style.display = 'none';
    } else {
      addNodeDataPropsSection.style.display = 'block';
      nodeModalFormUi.renderAddNodeDataPropsList(editState.addNodeDataPropertyRestrictions, session.dataProperties, onRemoveAddNodeDataProp);
    }
  }
  const resultsDiv = document.getElementById('addNodeExternalResults');
  const descDiv = document.getElementById('addNodeExternalDescription');
  if (resultsDiv) resultsDiv.style.display = 'none';
  if (descDiv) descDiv.style.display = 'none';
  
  okBtn.disabled = true;
  modal.style.display = 'flex';
  if (customInput) customInput.focus();
}

export async function handleExternalClassSearch(query: string): Promise<void> {
  const resultsDiv = document.getElementById('addNodeExternalResults');
  const descDiv = document.getElementById('addNodeExternalDescription');
  
  if (!query.trim()) {
    if (resultsDiv) resultsDiv.style.display = 'none';
    if (descDiv) descDiv.style.display = 'none';
    editState.selectedExternalClass = null;
    refreshAddNodeOkButton();
    return;
  }
  
  // Debug logging
  // Debug logging (only in debug mode)
  if (isDebugMode()) {
    debugLog('Search query:', query);
    debugLog('External references:', session.externalOntologyReferences);
  }
  
  if (session.externalOntologyReferences.length === 0) {
    if (resultsDiv) {
      resultsDiv.innerHTML = '<div style="padding: 8px; color: #666; font-size: 11px;">No external ontologies referenced. Add one via "Manage external references".</div>';
      resultsDiv.style.display = 'block';
    }
    if (descDiv) descDiv.style.display = 'none';
    editState.selectedExternalClass = null;
    refreshAddNodeOkButton();
    return;
  }
  
  try {
    const queryLower = query.toLowerCase().trim();
    const mainBase = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
    const referencedFromStore = session.ttlStore && mainBase
      ? getReferencedExternalClassesFromStore(session.ttlStore, mainBase, session.externalOntologyReferences)
      : [];
    referencedFromStore.forEach((c) => session.knownExternalClassUris.add(c.uri));
    const stubs: ExternalClassInfo[] = [];
    for (const uri of session.knownExternalClassUris) {
      if (referencedFromStore.some((c) => c.uri === uri)) continue;
      const stub = getStubExternalClassForUri(uri, session.externalOntologyReferences);
      if (stub) stubs.push(stub);
    }
    const combined = [...referencedFromStore, ...stubs];
    const referencedMatches = combined.filter((cls) => {
      const localNameLower = cls.localName.toLowerCase();
      const labelLower = cls.label.toLowerCase();
      return localNameLower.includes(queryLower) || labelLower.includes(queryLower);
    });
    const fetched = await searchExternalClasses(query, session.externalOntologyReferences);
    const seenUris = new Set(referencedMatches.map((c) => c.uri));
    const fromFetched = fetched.filter((c) => !seenUris.has(c.uri));
    fromFetched.forEach((c) => seenUris.add(c.uri));
    const results = [...referencedMatches, ...fromFetched];
    // Debug logging (only in debug mode)
    if (isDebugMode()) {
      debugLog('Search results:', results);
    }

    const existingNodeIds = new Set((session.currentGraphDataForBuild?.nodes ?? session.rawData.nodes).map((n) => n.id));
    const ALREADY_IN_GRAPH_MSG = 'The node related to this class is already existing in the editor canvas.';
    const alreadyInGraphHtml = (msg: string) =>
      `<div style="font-size: 11px; color: #b8860b; margin-top: 4px; font-weight: 500;">${msg}</div>`;

    if (results.length === 0) {
      if (resultsDiv) {
        resultsDiv.innerHTML = '<div style="padding: 8px; color: #666; font-size: 11px;">No classes found</div>';
        resultsDiv.style.display = 'block';
      }
      if (descDiv) descDiv.style.display = 'none';
      editState.selectedExternalClass = null;
    } else if (results.length === 1) {
      const match = results[0];
      editState.selectedExternalClass = match;
      if (descDiv) {
        const alreadyInGraph = existingNodeIds.has(match.uri);
        descDiv.innerHTML = `
          <div style="font-weight: bold; margin-bottom: 4px;">${match.label}${match.prefix ? ` (${match.prefix}:${match.localName})` : ''}</div>
          ${match.comment ? `<div style="margin-top: 4px;">${match.comment}</div>` : ''}
          <div style="margin-top: 4px; font-size: 10px; color: #999;">From: ${match.ontologyUrl}</div>
          ${alreadyInGraph ? alreadyInGraphHtml(ALREADY_IN_GRAPH_MSG) : ''}
        `;
        descDiv.style.display = 'block';
      }
      if (resultsDiv) resultsDiv.style.display = 'none';
    } else {
    if (resultsDiv) {
      resultsDiv.innerHTML = results.map((cls, idx) => {
        const alreadyInGraph = existingNodeIds.has(cls.uri);
        return `
        <div class="external-class-result" data-index="${idx}" style="padding: 8px; border-bottom: 1px solid #eee; cursor: pointer; ${idx === 0 ? 'background: #f0f7ff;' : ''}${alreadyInGraph ? ' opacity: 0.75;' : ''}" onmouseover="this.style.background='#f0f7ff'" onmouseout="this.style.background='${idx === 0 ? '#f0f7ff' : 'transparent'}'">
          <div style="font-weight: bold;">${cls.label}${cls.prefix ? ` (${cls.prefix}:${cls.localName})` : ''}</div>
          ${cls.comment ? `<div style="font-size: 10px; color: #666; margin-top: 2px;">${cls.comment.substring(0, 100)}${cls.comment.length > 100 ? '...' : ''}</div>` : ''}
          <div style="font-size: 9px; color: #999; margin-top: 2px;">From: ${cls.ontologyUrl}</div>
          ${alreadyInGraph ? alreadyInGraphHtml(ALREADY_IN_GRAPH_MSG) : ''}
        </div>
      `;
      }).join('');
      resultsDiv.style.display = 'block';

      resultsDiv.querySelectorAll('.external-class-result').forEach((el, idx) => {
        el.addEventListener('click', () => {
          editState.selectedExternalClass = results[idx];
          if (descDiv) {
            const r = results[idx];
            const alreadyInGraph = existingNodeIds.has(r.uri);
            descDiv.innerHTML = `
              <div style="font-weight: bold; margin-bottom: 4px;">${r.label}${r.prefix ? ` (${r.prefix}:${r.localName})` : ''}</div>
              ${r.comment ? `<div style="margin-top: 4px;">${r.comment}</div>` : ''}
              <div style="margin-top: 4px; font-size: 10px; color: #999;">From: ${r.ontologyUrl}</div>
              ${alreadyInGraph ? alreadyInGraphHtml(ALREADY_IN_GRAPH_MSG) : ''}
            `;
            descDiv.style.display = 'block';
          }
          if (resultsDiv) resultsDiv.style.display = 'none';
          refreshAddNodeOkButton();
        });
      });
    }
    if (descDiv) descDiv.style.display = 'none';
    editState.selectedExternalClass = results[0];
    }
    
    refreshAddNodeOkButton();
  } catch (err) {
    console.error('Search error:', err);
    if (resultsDiv) {
      resultsDiv.innerHTML = '<div style="padding: 8px; color: #d32f2f; font-size: 11px;">Error searching external ontologies. Check console for details.</div>';
      resultsDiv.style.display = 'block';
    }
    if (descDiv) descDiv.style.display = 'none';
    editState.selectedExternalClass = null;
    refreshAddNodeOkButton();
  }
}
