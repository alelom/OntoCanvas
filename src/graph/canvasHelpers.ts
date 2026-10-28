/**
 * Small lookups and view helpers for the graph canvas: the edge shown for a triple, the edge under a label point,
 * the term behind a node, bringing a node into view, and fading a colour.
 * Moved out of main.ts (#175).
 */
import { type TermLookup, buildTermLink } from '../lib/termUri';
import { getMainOntologyBase, getClassNamespace } from '../ontology/readOntology';
import { session, fileState, canvasState } from '../state/appState';
import type { GraphEdge } from '../types';
import { type EdgeLabelBox, findEdgeIdAtLabelPoint } from './edgeLabelHit';
import { Network } from 'vis-network/esnext';

/** The edge as drawn: from rawData, or else one only the external expansion draws (e.g. a restriction on an
 * imported class, #99), so its read-only lock still applies. */
export function findShownEdge(from: string, to: string, type: string): GraphEdge | undefined {
  const match = (e: GraphEdge) => e.from === from && e.to === to && e.type === type;
  return session.rawData.edges.find(match) ?? session.currentGraphDataForBuild?.edges.find(match);
}

/**
 * Convert hex color to rgba with opacity.
 * @param color Hex color string (e.g., "#3498db" or "#2c3e50")
 * @param opacity Opacity value between 0 and 1
 * @returns rgba color string (e.g., "rgba(52, 152, 219, 0.65)")
 */
export function applyOpacityToColor(color: string, opacity: number): string {
  // Remove # if present
  const hex = color.replace('#', '');
  // Parse RGB values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** Nodes/properties used to resolve a term's URI (includes external nodes when they are displayed). */
export function getTermLookup(): TermLookup {
  return { nodes: (session.currentGraphDataForBuild ?? session.rawData).nodes, objectProperties: session.objectProperties, dataProperties: session.dataProperties };
}

/** Link for the selected term: the loaded TTL + #fragment for main-ontology terms, else the term URI. */
export function getTermLink(termUri: string | null): string | null {
  const namespaces = session.ttlStore ? [getMainOntologyBase(session.ttlStore), getClassNamespace(session.ttlStore)] : [];
  return buildTermLink(termUri, fileState.loadedFilePath, namespaces.filter((ns): ns is string => !!ns));
}

/**
 * Return the id of the edge whose label box is under `domPos`, or null.
 * vis-network hit-tests edges by their line, not their label, so we test the label boxes
 * ourselves using each edge's rendered label size (from the live network body).
 */
export function getEdgeIdAtLabelPoint(net: Network, domPos: { x: number; y: number }): string | null {
  const body = (net as unknown as { body?: { edges?: Record<string, {
    options?: { label?: string };
    labelModule?: { size?: { left: number; top: number; width: number; height: number } };
  }> } }).body;
  if (!body?.edges) return null;
  const canvasPos = net.DOMtoCanvas(domPos);
  const boxes: EdgeLabelBox[] = [];
  for (const id in body.edges) {
    const edge = body.edges[id];
    if (!edge?.options?.label) continue;
    const size = edge.labelModule?.size;
    if (!size || typeof size.left !== 'number' || typeof size.top !== 'number') continue;
    boxes.push({ id, left: size.left, top: size.top, width: size.width, height: size.height });
  }
  return findEdgeIdAtLabelPoint(boxes, canvasPos);
}

/**
 * Bring a node into view, keeping the current zoom.
 *
 * `applyFilter(true)` deliberately restores the viewport the user was looking at, which is right for
 * an edit but wrong for something just created off-screen: a data property with no rdfs:domain is
 * placed in the free-standing band below the class graph, so on any non-trivial ontology the user
 * confirms the dialog and sees nothing happen.
 *
 * applyFilter restores that viewport from a requestAnimationFrame callback, so the reveal is queued
 * behind it: callbacks run in registration order, and applyFilter registered its own before
 * returning. Moving the view synchronously here would just be undone a frame later.
 */
export function revealNodeInView(nodeId: string): void {
  requestAnimationFrame(() => {
    if (!canvasState.network) return;
    const position = canvasState.network.getPositions([nodeId])[nodeId];
    if (!position) return;
    canvasState.network.moveTo({
      position,
      scale: canvasState.network.getScale(),
      animation: fileState.skipSlowOperationsForTests
        ? false
        : { duration: 400, easingFunction: 'easeInOutQuad' },
    });
  });
}
