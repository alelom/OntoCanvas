/**
 * The layout options the display config and the layout menu set: the tiered hierarchy, stacking leaves, and the
 * button that puts saved positions back. Moved out of main.ts (#175).
 */
import { DEFAULT_HIERARCHY_TYPES } from '../layouts/hierarchyRules';
import { canvasState } from '../state/appState';

/**
 * Sets the relationships that make the tiers (#151), and ticks them in the Object Properties menu. Returns whether
 * they changed: the positions laid out with the old ones are then wrong.
 */
export function setHierarchyTypes(types: string[] | undefined): boolean {
  const next = new Set(types ?? DEFAULT_HIERARCHY_TYPES);
  const changed = next.size !== canvasState.hierarchyTypes.size || [...next].some((t) => !canvasState.hierarchyTypes.has(t));
  canvasState.hierarchyTypes = next;
  document.querySelectorAll<HTMLInputElement>('.edge-tier-cb').forEach((cb) => {
    cb.checked = canvasState.hierarchyTypes.has(cb.dataset.type!);
  });
  return changed;
}

/** Sets whether leaf children are stacked under their parent (#159), and its checkbox. Returns whether it changed. */
export function setStackLeaves(value: boolean): boolean {
  const changed = value !== canvasState.stackLeaves;
  canvasState.stackLeaves = value;
  const el = document.getElementById('stackLeaves') as HTMLInputElement | null;
  if (el) el.checked = value;
  return changed;
}

/** Sets whether individuals are laid out by force relaxation (#209), and its checkbox. */
export function setRelaxIndividuals(value: boolean): void {
  canvasState.relaxIndividuals = value;
  const el = document.getElementById('relaxIndividuals') as HTMLInputElement | null;
  if (el) el.checked = value;
}

export function updateRestorePositionsButton(): void {
  const btn = document.getElementById('restorePositions');
  if (btn) btn.style.display = canvasState.positionsBeforeLayout ? '' : 'none';
}
