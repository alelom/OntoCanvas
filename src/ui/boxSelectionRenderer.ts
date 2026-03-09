/**
 * Box selection rectangle renderer.
 * Creates and manages a visual overlay rectangle for box selection.
 */

import { isDebugMode } from '../utils/debug';

let overlayElement: HTMLDivElement | null = null;

/**
 * Initialize the box selection overlay element.
 * Should be called once when setting up the network.
 */
export function initBoxSelectionOverlay(container: HTMLElement): void {
  if (overlayElement) {
    overlayElement.remove();
  }

  overlayElement = document.createElement('div');
  overlayElement.id = 'boxSelectionOverlay';
  overlayElement.style.cssText = `
    position: absolute;
    pointer-events: none;
    border: 2px dashed #3498db;
    background-color: rgba(128, 128, 128, 0.3);
    display: none;
    z-index: 10000;
    left: 0;
    top: 0;
    box-sizing: border-box;
  `;

  // Position overlay relative to container
  const containerStyle = window.getComputedStyle(container);
  if (containerStyle.position === 'static') {
    container.style.position = 'relative';
  }
  container.appendChild(overlayElement);
  
  // Always log initialization for debugging
  console.log('[BoxSelection] Overlay initialized on container:', {
    containerId: container.id,
    containerTag: container.tagName,
    overlayId: overlayElement.id,
    overlayExists: document.getElementById('boxSelectionOverlay') !== null,
  });
  
  if (isDebugMode()) {
    console.log('[BoxSelection] Container style:', {
      position: containerStyle.position,
      zIndex: containerStyle.zIndex,
    });
  }
}

/**
 * Show the selection rectangle at the specified coordinates.
 * @param startX Starting X coordinate (relative to container)
 * @param startY Starting Y coordinate (relative to container)
 * @param currentX Current X coordinate (relative to container)
 * @param currentY Current Y coordinate (relative to container)
 */
export function showSelectionRectangle(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number
): void {
  if (!overlayElement) {
    console.warn('[BoxSelection] Overlay element not initialized');
    return;
  }

  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);

  overlayElement.style.left = `${left}px`;
  overlayElement.style.top = `${top}px`;
  overlayElement.style.width = `${width}px`;
  overlayElement.style.height = `${height}px`;
  overlayElement.style.display = 'block';
  
  // Debug logging
  if (isDebugMode()) {
    console.log('[BoxSelection] Showing rectangle:', { left, top, width, height });
  }
}

/**
 * Hide the selection rectangle.
 */
export function hideSelectionRectangle(): void {
  if (overlayElement) {
    overlayElement.style.display = 'none';
  }
}

/**
 * Clean up the overlay element.
 */
export function cleanupBoxSelectionOverlay(): void {
  if (overlayElement) {
    overlayElement.remove();
    overlayElement = null;
  }
}
