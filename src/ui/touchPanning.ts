/**
 * Touch panning support for 2-finger panning on touch devices.
 */

import type { Network } from 'vis-network';

export interface TouchState {
  touches: Map<number, { x: number; y: number }>;
  lastCenter: { x: number; y: number } | null;
  lastDistance: number | null;
  isPanning: boolean;
  isZooming: boolean;
}

const MIN_TOUCH_DISTANCE = 10; // Minimum distance to start panning

/**
 * Calculate distance between two touch points.
 */
function calculateTouchDistance(
  touch1: { x: number; y: number },
  touch2: { x: number; y: number }
): number {
  return Math.sqrt(
    Math.pow(touch2.x - touch1.x, 2) + Math.pow(touch2.y - touch1.y, 2)
  );
}

/**
 * Calculate center point between two touches.
 */
function calculateTouchCenter(
  touch1: { x: number; y: number },
  touch2: { x: number; y: number }
): { x: number; y: number } {
  return {
    x: (touch1.x + touch2.x) / 2,
    y: (touch1.y + touch2.y) / 2,
  };
}

/**
 * Create a new touch state.
 */
export function createTouchState(): TouchState {
  return {
    touches: new Map(),
    lastCenter: null,
    lastDistance: null,
    isPanning: false,
    isZooming: false,
  };
}

/**
 * Handle touch start event.
 */
export function handleTouchStart(
  state: TouchState,
  e: TouchEvent,
  container: HTMLElement
): void {
  const rect = container.getBoundingClientRect();
  
  for (let i = 0; i < e.touches.length; i++) {
    const touch = e.touches[i];
    state.touches.set(touch.identifier, {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    });
  }

  // If we have exactly 2 touches, prepare for panning/zooming
  if (state.touches.size === 2) {
    const touchesArray = Array.from(state.touches.values());
    state.lastCenter = calculateTouchCenter(touchesArray[0], touchesArray[1]);
    state.lastDistance = calculateTouchDistance(touchesArray[0], touchesArray[1]);
    state.isPanning = false;
    state.isZooming = false;
  }
}

/**
 * Handle touch move event for 2-finger panning.
 */
export function handleTouchMove(
  state: TouchState,
  e: TouchEvent,
  net: Network,
  container: HTMLElement
): void {
  if (state.touches.size !== 2) return;

  const rect = container.getBoundingClientRect();
  const currentTouches: { x: number; y: number }[] = [];

  // Get current touch positions
  for (let i = 0; i < e.touches.length; i++) {
    const touch = e.touches[i];
    if (state.touches.has(touch.identifier)) {
      currentTouches.push({
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      });
    }
  }

  if (currentTouches.length !== 2 || !state.lastCenter || state.lastDistance === null) {
    return;
  }

  const currentCenter = calculateTouchCenter(currentTouches[0], currentTouches[1]);
  const currentDistance = calculateTouchDistance(currentTouches[0], currentTouches[1]);

  // Determine if we're panning or zooming based on distance change
  const distanceChange = Math.abs(currentDistance - state.lastDistance);
  const centerMovement = calculateTouchDistance(state.lastCenter, currentCenter);

  // If distance changed significantly, it's zooming
  if (distanceChange > MIN_TOUCH_DISTANCE) {
    state.isZooming = true;
    state.isPanning = false;
    
    // Handle pinch-to-zoom
    const scaleChange = currentDistance / state.lastDistance;
    const currentScale = net.getScale();
    const newScale = currentScale * scaleChange;
    
    // Get view position
    const viewPos = net.getViewPosition();
    
    // Zoom towards the center point
    const canvasCenter = net.DOMtoCanvas(currentCenter);
    
    net.moveTo({
      position: viewPos,
      scale: Math.max(0.1, Math.min(5, newScale)), // Clamp scale
      animation: false,
    });

    state.lastDistance = currentDistance;
  } 
  // If center moved significantly, it's panning
  else if (centerMovement > MIN_TOUCH_DISTANCE) {
    state.isPanning = true;
    state.isZooming = false;

    // Calculate pan delta
    const dx = currentCenter.x - state.lastCenter.x;
    const dy = currentCenter.y - state.lastCenter.y;
    
    // Convert to canvas coordinates
    const scale = net.getScale();
    const canvasDx = dx / scale;
    const canvasDy = dy / scale;
    
    // Get current view position
    const viewPos = net.getViewPosition();
    
    // Apply pan
    net.moveTo({
      position: {
        x: viewPos.x - canvasDx,
        y: viewPos.y - canvasDy,
      },
      scale: scale,
      animation: false,
    });

    state.lastCenter = currentCenter;
  }
}

/**
 * Handle touch end event.
 */
export function handleTouchEnd(
  state: TouchState,
  e: TouchEvent
): void {
  // Remove ended touches
  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i];
    state.touches.delete(touch.identifier);
  }

  // Reset state if we have fewer than 2 touches
  if (state.touches.size < 2) {
    state.lastCenter = null;
    state.lastDistance = null;
    state.isPanning = false;
    state.isZooming = false;
  }
}

/**
 * Handle touch cancel event.
 */
export function handleTouchCancel(state: TouchState): void {
  state.touches.clear();
  state.lastCenter = null;
  state.lastDistance = null;
  state.isPanning = false;
  state.isZooming = false;
}
