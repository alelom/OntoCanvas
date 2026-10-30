/**
 * The canvas interaction: selecting, double clicking, dragging, the context menu and keyboard navigation.
 * Moved out of main.ts (#175).
 */
import { session, canvasState, editState } from '../state/appState';
import { showAddNodeModal } from '../ui/addNodeModal';
import { hideCanvasTooltip, pickTooltip, showCanvasTooltip } from '../ui/canvasTooltip';
import { attachClassExpressionMarks } from '../ui/classExpressionInteraction';
import { showContextMenu } from '../ui/contextMenu';
import { hideEdgeLinesUnderNodes } from '../ui/edgeNodeClipping';
import { openEditModalForNode, openEditModalForEdge } from '../ui/editModals';
import { isIndividualNodeId } from '../abox/individualsLayer';
import { showMultiEditModal } from '../ui/nodeModalHelpers';
import { attachSearchOutline } from '../ui/searchOutlineOverlay';
import { updateSelectionInfoDisplay } from '../ui/selectionInfo';
import { isEmbedded } from '../utils/embedMode';
import { getEdgeIdAtLabelPoint } from './canvasHelpers';
import { Network } from 'vis-network/esnext';

export function setupNetworkSelectionAndNavigation(
  net: Network,
  container: HTMLElement
): void {
  // Draw anonymous class-expression marks (∪ ∩ ¬ {}) on top of the graph.
  const classExprMarks = attachClassExpressionMarks(
    net as unknown as Parameters<typeof attachClassExpressionMarks>[0],
    () => session.rawData?.classExpressions ?? [],
    () => canvasState.classExpressionFontRatios,
  );
  // Edge lines stop at node outlines, even under semi-transparent (imported) nodes (#71).
  hideEdgeLinesUnderNodes(net);
  // A pulsing outline around what the search matched, in an SVG layer that follows the view (#84).
  attachSearchOutline(net as unknown as Parameters<typeof attachSearchOutline>[0], container, () => canvasState.searchOutlineTargets);
  const RIGHT_BUTTON = 2;
  const LEFT_BUTTON = 1;
  let rightPanStart: { x: number; y: number; viewPos: { x: number; y: number }; scale: number } | null = null;
  let selectionBeforeClick: string[] = [];
  /** Node/edge under cursor at right mousedown (so context menu uses exact click target, not mouseup). */
  let rightClickNodeId: string | null = null;
  let rightClickEdgeId: string | null = null;

  // Prevent browser's default context menu on the container
  container.oncontextmenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  };
  
  // Also add event listener to catch contextmenu events (more reliable)
  container.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, true); // Use capture phase to catch early

  const getContainerCoords = (e: MouseEvent) => {
    const rect = container.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: MouseEvent) => {
    const target = e.target as Node;
    // Check if click is within the container (including canvas elements)
    if (!container.contains(target) && !container.isSameNode(target)) {
      // Also check if the target is a child of the container's canvas
      const canvas = container.querySelector('canvas');
      if (!canvas || !canvas.contains(target)) return;
    }
    const coords = getContainerCoords(e);
    if (e.button === RIGHT_BUTTON) {
      // Check if clicking on a node or edge (line, or — falling back — the edge's label box)
      const nodeAt = net.getNodeAt(coords);
      const edgeAt = net.getEdgeAt(coords) ?? (nodeAt == null ? getEdgeIdAtLabelPoint(net, coords) : null);

      // If clicking on node/edge, don't start panning; store target for context menu (exact click position)
      if (nodeAt != null || edgeAt != null) {
        rightPanStart = null;
        rightClickNodeId = nodeAt != null ? String(nodeAt) : null;
        rightClickEdgeId = edgeAt != null ? String(edgeAt) : null;
        return;
      }
      rightClickNodeId = null;
      rightClickEdgeId = null;

      // Otherwise, start panning on empty canvas
      const viewPos = net.getViewPosition();
      const scale = net.getScale();
      rightPanStart = { x: coords.x, y: coords.y, viewPos: { ...viewPos }, scale };
    } else if (e.button === LEFT_BUTTON) {
      selectionBeforeClick = net.getSelectedNodes().map(String);
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    const coords = getContainerCoords(e);
    if (rightPanStart) {
      const dx = coords.x - rightPanStart.x;
      const dy = coords.y - rightPanStart.y;
      const canvasDx = dx / rightPanStart.scale;
      const canvasDy = dy / rightPanStart.scale;
      const newViewPos = {
        x: rightPanStart.viewPos.x - canvasDx,
        y: rightPanStart.viewPos.y - canvasDy,
      };
      net.moveTo({
        position: newViewPos,
        scale: rightPanStart.scale,
        animation: false,
      });
      rightPanStart = { ...rightPanStart, x: coords.x, y: coords.y, viewPos: newViewPos };
      hideCanvasTooltip(true);
      return;
    }

    // One tooltip for whatever is under the cursor: edge label, class-expression mark, node or edge line (#109).
    const target = e.target as Node;
    const overContainer =
      container.contains(target) || (container.querySelector('canvas')?.contains(target) ?? false);
    if (!overContainer) {
      hideCanvasTooltip();
      return;
    }
    const body = (net as unknown as { body?: { nodes?: Record<string, { options?: { title?: unknown } }>; edges?: Record<string, { options?: { title?: unknown } }> } }).body;
    const titleOf = (item: { options?: { title?: unknown } } | undefined) =>
      typeof item?.options?.title === 'string' ? item.options.title : null;
    // The example images (#142) are kept on the data records, which vis-network does not copy into its options.
    const records = (net as unknown as { body?: { data?: Record<'nodes' | 'edges', { get(id: string): { exampleImages?: string[] } | null }> } }).body?.data;
    const contentOf = (kind: 'nodes' | 'edges', id: string) => ({
      text: titleOf(body?.[kind]?.[id]) ?? '',
      images: records?.[kind]?.get(id)?.exampleImages,
    });
    const labelEdgeId = getEdgeIdAtLabelPoint(net, coords);
    const nodeId = net.getNodeAt(coords);
    const lineEdgeId = nodeId === undefined ? net.getEdgeAt(coords) : undefined;
    const content = pickTooltip({
      edgeLabel: labelEdgeId ? contentOf('edges', labelEdgeId) : null,
      // A class-expression mark (∪ ∩ ¬ {}) or connector explains the expression and how to edit it.
      expressionMark: classExprMarks.tooltipAt(net.DOMtoCanvas(coords)),
      node: nodeId !== undefined ? contentOf('nodes', String(nodeId)) : null,
      edgeLine: lineEdgeId !== undefined ? contentOf('edges', String(lineEdgeId)) : null,
    });
    if (content) showCanvasTooltip(content, e.clientX, e.clientY);
    else hideCanvasTooltip();
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (e.button === RIGHT_BUTTON) {
      const target = e.target as Node;
      const isInContainer = container.contains(target) || container.isSameNode(target) || 
                           (container.querySelector('canvas')?.contains(target) ?? false);
      
      // Prevent browser's default context menu
      if (isInContainer) {
        e.preventDefault();
        e.stopPropagation();
      }
      
      // Check if we were panning (rightPanStart exists) or if we should show context menu.
      // In read-only embedded mode the menu is reduced to the read-only "Copy URI".
      if (!rightPanStart && isInContainer) {
        // Show context menu; use node/edge stored at mousedown so target is exact (e.g. data property node)
        showContextMenu(e, net, container, rightClickNodeId, rightClickEdgeId, { copyOnly: isEmbedded() });
      }
      rightPanStart = null;
      rightClickNodeId = null;
      rightClickEdgeId = null;
    }
  };

  const handleMouseLeave = () => {
    rightPanStart = null;
    hideCanvasTooltip();
  };

  // Prevent browser context menu on container and all its children (including canvas)
  const handleContextMenu = (e: MouseEvent) => {
    const target = e.target as Node;
    if (container.contains(target) || container.isSameNode(target)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    }
  };
  
  container.addEventListener('contextmenu', handleContextMenu, true); // Capture phase
  document.addEventListener('mousedown', handleMouseDown, true);
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('mouseup', handleMouseUp, true);
  container.addEventListener('mouseleave', handleMouseLeave);

  const handleNativeClick = (e: MouseEvent) => {
    // Allow clicks even when ttlStore is null (e.g., empty ontology) - network should still work
    if (!canvasState.network) return;
    const target = e.target as HTMLElement;
    // When clicking Add node button, let vis-network's manipulation UI handle it
    // It will call our addNode handler when canvas is clicked
    if (target.closest?.('.vis-add')) {
      editState.addNodeMode = true;
      // Don't prevent default - let vis-network handle it
      return;
    }
    // Don't interfere with manipulation UI unless we're in add node mode
    if (target.closest?.('.vis-manipulation') && !editState.addNodeMode) return;
    
    // Only handle clicks on the canvas itself when in add node mode
    if (!editState.addNodeMode) return;
    
    // Check if click is on the network canvas (not on UI elements)
    // Allow clicks on the network container or its children
    const isNetworkClick = container.contains(target) || target.closest('#network') || target.id === 'network';
    if (!isNetworkClick) return;
    
    const rect = container.getBoundingClientRect();
    const domPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const nodeAt = net.getNodeAt(domPos);
    if (nodeAt != null) {
      // Clicked on a node, exit add node mode
      editState.addNodeMode = false;
      return;
    }
    const canvasPos = net.DOMtoCanvas(domPos);
    showAddNodeModal(canvasPos.x, canvasPos.y);
    editState.addNodeMode = false; // Reset after showing modal
  };

  const handleNativeDblclick = (e: MouseEvent) => {
    if (!session.ttlStore || !canvasState.network) return;
    // Embedded mode is read-only: no edit modals, and no create-node on empty-canvas double-click.
    if (isEmbedded()) return;
    const target = e.target as HTMLElement;
    if (target.closest?.('.vis-manipulation')) return;
    const rect = container.getBoundingClientRect();
    const domPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const nodeAt = net.getNodeAt(domPos);
    if (nodeAt != null) {
      const nodeId = String(nodeAt);
      // Individuals are drawn read-only (#209).
      if (isIndividualNodeId(nodeId)) return;
      const selectedIds = net.getSelectedNodes().map(String);
      if (selectedIds.length > 1 && selectedIds.includes(nodeId)) {
        showMultiEditModal(selectedIds);
      } else {
        openEditModalForNode(nodeId);
      }
      return;
    }
    const edgeAt = net.getEdgeAt(domPos) ?? getEdgeIdAtLabelPoint(net, domPos);
    if (edgeAt != null) {
      openEditModalForEdge(String(edgeAt));
      return;
    }
    const canvasPos = net.DOMtoCanvas(domPos);
    showAddNodeModal(canvasPos.x, canvasPos.y);
  };

  container.addEventListener('click', handleNativeClick, true);
  container.addEventListener('dblclick', handleNativeDblclick, true);

  net.on('click', (params: { nodes: string[]; edges: string[]; pointer?: { DOM?: { x: number; y: number } }; event?: { srcEvent?: MouseEvent } }) => {
    const clickedNode = params.nodes[0] as string | undefined;
    const ctrlKey = params.event?.srcEvent?.ctrlKey ?? false;

    // A click on a class-expression mark opens its details. Checked before node handling so a
    // data-property badge (which overlaps its stub node) wins over selecting the node underneath.
    if (!editState.addNodeMode && container) {
      let dom = params.pointer?.DOM ?? null;
      if (!dom && params.event?.srcEvent) {
        const rect = container.getBoundingClientRect();
        dom = { x: params.event.srcEvent.clientX - rect.left, y: params.event.srcEvent.clientY - rect.top };
      }
      if (dom && classExprMarks.openAt(net.DOMtoCanvas(dom))) return;
    }

    // If in add node mode and no node clicked, show the add node modal
    if (editState.addNodeMode && !clickedNode) {
      const srcEvent = params.event?.srcEvent;
      const pointer = params.pointer;

      // Try to get position from srcEvent first, then from pointer
      let domPos: { x: number; y: number } | null = null;
      if (srcEvent && container) {
        const rect = container.getBoundingClientRect();
        domPos = { x: srcEvent.clientX - rect.left, y: srcEvent.clientY - rect.top };
      } else if (pointer?.DOM) {
        domPos = pointer.DOM;
      }
      
      if (domPos) {
        const nodeAt = net.getNodeAt(domPos);
        if (nodeAt == null) {
          const canvasPos = net.DOMtoCanvas(domPos);
          showAddNodeModal(canvasPos.x, canvasPos.y);
          return; // Return early to prevent other handlers
        }
      }
      return;
    }

    // If in add node mode and a node is clicked, exit add node mode
    if (editState.addNodeMode && clickedNode) {
      editState.addNodeMode = false;
      return;
    }

    // If not in add node mode and no node clicked: vis-network selects an edge only when its line
    // is clicked, so if nothing was hit, try selecting an edge by its label box.
    if (!clickedNode) {
      if ((params.edges?.length ?? 0) === 0) {
        // vis-network exposes the pointer at params.pointer.DOM (container-relative). Fall back to
        // the raw source event if needed.
        let domPos = params.pointer?.DOM ?? null;
        if (!domPos && params.event?.srcEvent && container) {
          const rect = container.getBoundingClientRect();
          domPos = { x: params.event.srcEvent.clientX - rect.left, y: params.event.srcEvent.clientY - rect.top };
        }
        if (domPos) {
          const edgeId = getEdgeIdAtLabelPoint(net, domPos);
          if (edgeId) {
            net.setSelection({ nodes: [], edges: [edgeId] }, { unselectAll: true, highlightEdges: true });
            updateSelectionInfoDisplay(net);
          }
          // (A union-mark click was already handled before node selection, above.)
        }
      }
      return;
    }

    if (ctrlKey) {
      const wasSelected = selectionBeforeClick.includes(clickedNode);
      const newSelection = wasSelected
        ? selectionBeforeClick.filter((id) => id !== clickedNode)
        : [...new Set([...selectionBeforeClick, clickedNode])];
      net.setSelection({ nodes: newSelection }, { unselectAll: false, highlightEdges: true });
    } else {
      const newSelection = [clickedNode];
      net.setSelection({ nodes: newSelection }, { unselectAll: false, highlightEdges: true });
    }
    updateSelectionInfoDisplay(net);
  });
}
