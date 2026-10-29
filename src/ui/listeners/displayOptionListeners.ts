/**
 * The display options: layout mode, restoring positions, stacking leaves, thing data properties, the text and search popovers, the layout hint and the font sizes.
 * Moved out of eventListeners.ts (#198).
 */
import { actions } from '../../state/actions';
import { canvasState } from '../../state/appState';
import { scheduleDisplayConfigSave } from '../../workflows/displayConfigSave';
import { setStackLeaves } from '../../workflows/layoutOptions';
import { restoreNodePositions, forgetNodePositions } from '../../workflows/nodePositions';
import { initLayoutModeHint } from '../layoutModeHint';
import { attachPopover } from '../searchOptions';

export function wireDisplayOptions(): void {
  document.getElementById('layoutMode')?.addEventListener('change', () => actions.applyFilter());
  document.getElementById('restorePositions')?.addEventListener('click', restoreNodePositions);

  document.getElementById('stackLeaves')?.addEventListener('change', (e) => {
    setStackLeaves((e.target as HTMLInputElement).checked);
    forgetNodePositions();
    actions.applyFilter(true);
    scheduleDisplayConfigSave();
  });
  document.getElementById('clusterThingDataProps')?.addEventListener('change', (e) => {
    canvasState.clusterThingDataProperties = (e.target as HTMLInputElement).checked;
    actions.applyFilter(true);
    scheduleDisplayConfigSave();
  });

  for (const name of ['textDisplay', 'searchOptions']) {
    const wrap = document.getElementById(`${name}Wrap`);
    const toggle = document.getElementById(`${name}Toggle`);
    const popup = document.getElementById(`${name}Popup`);
    if (wrap && toggle && popup) attachPopover(wrap, toggle, popup);
  }

  // Layout-mode hint popup (describes the logic of each layout mode).
  initLayoutModeHint();

  document.getElementById('wrapChars')?.addEventListener('input', () => actions.applyFilter());
  document.getElementById('wrapChars')?.addEventListener('change', () => actions.applyFilter());
  document.getElementById('minFontSize')?.addEventListener('input', () => actions.applyFilter());
  document.getElementById('minFontSize')?.addEventListener('change', () => actions.applyFilter());
  document.getElementById('maxFontSize')?.addEventListener('input', () => actions.applyFilter());
  document.getElementById('maxFontSize')?.addEventListener('change', () => actions.applyFilter());
  document.getElementById('relationshipFontSize')?.addEventListener('input', () => actions.applyFilter());
  document.getElementById('relationshipFontSize')?.addEventListener('change', () => actions.applyFilter());
  document.getElementById('dataPropertyFontSize')?.addEventListener('input', () => actions.applyFilter());
  document.getElementById('dataPropertyFontSize')?.addEventListener('change', () => actions.applyFilter());
}
