import type { Network } from 'vis-network/esnext';
import {
  copyRelationshipsTargetingNode,
  pasteRelationshipsToNode,
  hasCopiedRelationships,
  getCopiedRelationships,
  type CopiedRelationship,
} from '../lib/relationshipClipboard';
import {
  validateAllRelationships,
  type ValidationResult,
} from '../lib/ontologyValidator';
import type { GraphData } from '../types';
import type { Store } from 'n3';

/**
 * Callback type for when relationships are pasted.
 */
export type OnPasteCallback = (
  addedEdges: Array<{ from: string; to: string; type: string }>,
  failedEdges: Array<{ edge: CopiedRelationship; reason: string }>
) => void;

/**
 * Callback type for when relationships are copied.
 */
export type OnCopyCallback = (count: number) => void;

/**
 * Callback type for when a node should be edited.
 */
export type OnEditNodeCallback = (nodeId: string) => void;

/**
 * Callback type for when an edge should be edited.
 */
export type OnEditEdgeCallback = (edgeId: string) => void;

let contextMenuElement: HTMLElement | null = null;
let currentNetwork: Network | null = null;
let currentStore: Store | null = null;
let currentRawData: GraphData | null = null;
let onPasteCallback: OnPasteCallback | null = null;
let onCopyCallback: OnCopyCallback | null = null;
let onEditNodeCallback: ((nodeId: string) => void) | null = null;
let onEditEdgeCallback: ((edgeId: string) => void) | null = null;
let currentTargetNodeId: string | null = null;

/**
 * Initialize the context menu system.
 */
export function initContextMenu(
  network: Network,
  container: HTMLElement,
  store: Store,
  rawData: GraphData,
  onPaste: OnPasteCallback,
  onCopy: OnCopyCallback,
  onEditNode: OnEditNodeCallback,
  onEditEdge: OnEditEdgeCallback
): void {
  currentNetwork = network;
  currentStore = store;
  currentRawData = rawData;
  onPasteCallback = onPaste;
  onCopyCallback = onCopy;
  onEditNodeCallback = onEditNode;
  onEditEdgeCallback = onEditEdge;

  // Create context menu element if it doesn't exist
  if (!contextMenuElement) {
    contextMenuElement = document.createElement('div');
    contextMenuElement.id = 'contextMenu';
    contextMenuElement.style.cssText = `
      position: absolute;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      z-index: 10000;
      display: none;
      min-width: 200px;
      padding: 4px 0;
    `;
    document.body.appendChild(contextMenuElement);
  }

  // Prevent browser context menu on the context menu element itself
  if (contextMenuElement) {
    contextMenuElement.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    }, true);
  }

  // Hide menu when clicking outside
  document.addEventListener('click', (e) => {
    if (contextMenuElement && !contextMenuElement.contains(e.target as Node)) {
      hideContextMenu();
    }
  });

  // Hide menu on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && contextMenuElement?.style.display !== 'none') {
      hideContextMenu();
    }
  });
}

/**
 * Show context menu at the given position.
 */
export function showContextMenu(
  event: MouseEvent,
  network: Network,
  container: HTMLElement
): void {
  if (!contextMenuElement) {
    console.warn('Context menu element not found. Initializing...');
    // Try to create the element if it doesn't exist
    contextMenuElement = document.createElement('div');
    contextMenuElement.id = 'contextMenu';
    contextMenuElement.style.cssText = `
      position: absolute;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      z-index: 10000;
      display: none;
      min-width: 200px;
      padding: 4px 0;
    `;
    document.body.appendChild(contextMenuElement);
  }
  
  if (!currentRawData) {
    console.warn('Context menu: currentRawData is null. Menu cannot be shown.');
    return;
  }

  // Prevent default context menu aggressively
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  // Get click position
  const rect = container.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  // Check what was clicked
  const domPos = { x, y };
  const nodeAt = network.getNodeAt(domPos);
  const edgeAt = network.getEdgeAt(domPos);

  currentTargetNodeId = nodeAt ? String(nodeAt) : null;

  // Update menu items based on what was clicked
  updateContextMenuItems(nodeAt ? String(nodeAt) : null, edgeAt ? String(edgeAt) : null);

  // Position and show menu
  contextMenuElement.style.left = `${event.clientX}px`;
  contextMenuElement.style.top = `${event.clientY}px`;
  contextMenuElement.style.display = 'block';
}

/**
 * Hide the context menu.
 */
export function hideContextMenu(): void {
  if (contextMenuElement) {
    contextMenuElement.style.display = 'none';
  }
  currentTargetNodeId = null;
}

/**
 * Update context menu items based on what was clicked.
 */
function updateContextMenuItems(nodeId: string | null, edgeId: string | null): void {
  if (!contextMenuElement || !currentRawData) return;

  contextMenuElement.innerHTML = '';

  if (nodeId) {
    // Node context menu
    const copyBtn = createMenuItem('Copy relationships targeting this', () => {
      if (!currentRawData) return;
      const copied = copyRelationshipsTargetingNode(nodeId, currentRawData.edges);
      if (onCopyCallback) {
        onCopyCallback(copied.length);
      }
      hideContextMenu();
    });

    const pasteBtn = createMenuItem(
      'Paste relationships',
      () => {
        handlePaste(nodeId);
      },
      !hasCopiedRelationships()
    );

    // Separator before "Edit properties"
    const separator = createSeparator();
    
    // Edit properties option (always last)
    const editBtn = createMenuItem('Edit properties', () => {
      if (onEditNodeCallback) {
        onEditNodeCallback(nodeId);
      }
      hideContextMenu();
    });

    contextMenuElement.appendChild(copyBtn);
    contextMenuElement.appendChild(pasteBtn);
    contextMenuElement.appendChild(separator);
    contextMenuElement.appendChild(editBtn);
  } else if (edgeId) {
    // Edge context menu
    // Separator before "Edit properties"
    const separator = createSeparator();
    
    // Edit properties option (always last)
    const editBtn = createMenuItem('Edit properties', () => {
      if (onEditEdgeCallback) {
        onEditEdgeCallback(edgeId);
      }
      hideContextMenu();
    });

    contextMenuElement.appendChild(separator);
    contextMenuElement.appendChild(editBtn);
  } else {
    // Canvas context menu (placeholder for future)
    const placeholder = createMenuItem('(Canvas options coming soon)', () => {}, true);
    contextMenuElement.appendChild(placeholder);
  }
}

/**
 * Create a menu item element.
 */
function createMenuItem(
  label: string,
  onClick: () => void,
  disabled: boolean = false
): HTMLElement {
  const item = document.createElement('div');
  item.style.cssText = `
    padding: 8px 16px;
    cursor: ${disabled ? 'not-allowed' : 'pointer'};
    color: ${disabled ? '#999' : '#333'};
    background: ${disabled ? 'transparent' : 'white'};
    user-select: none;
  `;
  item.textContent = label;

  if (!disabled) {
    item.addEventListener('mouseenter', () => {
      item.style.background = '#f0f0f0';
    });
    item.addEventListener('mouseleave', () => {
      item.style.background = 'white';
    });
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
  }

  return item;
}

/**
 * Create a separator element for the menu.
 */
function createSeparator(): HTMLElement {
  const separator = document.createElement('div');
  separator.style.cssText = `
    height: 1px;
    background: #e0e0e0;
    margin: 4px 0;
  `;
  return separator;
}

/**
 * Handle paste operation with validation.
 */
function handlePaste(targetNodeId: string): void {
  if (!currentStore || !currentRawData || !onPasteCallback) {
    hideContextMenu();
    return;
  }

  const copiedRelationships = getCopiedRelationships();
  if (copiedRelationships.length === 0) {
    hideContextMenu();
    return;
  }

  // Validate all relationships before pasting
  const validationResults = validateAllRelationships(
    copiedRelationships,
    targetNodeId,
    currentStore,
    currentRawData
  );

  // Check if any validation failed
  const failedValidations = validationResults.filter((r) => !r.valid);
  if (failedValidations.length > 0) {
    // Show error message
    const reasons = failedValidations.map((r) => r.reason || 'Unknown error').join('\n');
    alert(`Cannot paste relationships:\n\n${reasons}`);
    hideContextMenu();
    return;
  }

  // All validations passed, proceed with paste
  const pasteResult = pasteRelationshipsToNode(
    targetNodeId,
    copiedRelationships,
    currentStore,
    currentRawData
  );

  if (pasteResult.failedEdges.length > 0) {
    // Some edges failed to paste (e.g., duplicates)
    const reasons = pasteResult.failedEdges
      .map((f) => `${f.edge.type}: ${f.reason}`)
      .join('\n');
    alert(`Some relationships could not be pasted:\n\n${reasons}`);
  }

  // Notify callback with results
  if (onPasteCallback) {
    onPasteCallback(
      pasteResult.addedEdges.map((e) => ({
        from: e.from,
        to: e.to,
        type: e.type,
      })),
      pasteResult.failedEdges
    );
  }

  hideContextMenu();
}

/**
 * Update the store and rawData references (called when they change).
 */
export function updateContextMenuData(store: Store, rawData: GraphData): void {
  currentStore = store;
  currentRawData = rawData;
}
