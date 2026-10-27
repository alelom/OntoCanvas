// @vitest-environment jsdom
/**
 * The layout option setters (moved out of main.ts, #175): they change the state, tick the matching controls, and say
 * whether anything changed (positions laid out under the old options are then wrong).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { canvasState } from '../../src/state/appState';
import { DEFAULT_HIERARCHY_TYPES } from '../../src/layouts/hierarchyRules';
import { setHierarchyTypes, setStackLeaves, updateRestorePositionsButton } from '../../src/workflows/layoutOptions';

beforeEach(() => {
  document.body.innerHTML = '';
  canvasState.hierarchyTypes = new Set(DEFAULT_HIERARCHY_TYPES);
  canvasState.stackLeaves = true;
  canvasState.positionsBeforeLayout = null;
});

describe('setHierarchyTypes', () => {
  it('reports no change when given the types it already has, in any order', () => {
    expect(setHierarchyTypes([...DEFAULT_HIERARCHY_TYPES].reverse())).toBe(false);
  });

  it('takes the defaults when given nothing, and reports a change from another set', () => {
    canvasState.hierarchyTypes = new Set(['other']);
    expect(setHierarchyTypes(undefined)).toBe(true);
    expect([...canvasState.hierarchyTypes].sort()).toEqual([...DEFAULT_HIERARCHY_TYPES].sort());
  });

  it('reports a change when the same number of types differ, and keeps the new ones', () => {
    const [first] = DEFAULT_HIERARCHY_TYPES;
    const swapped = [...DEFAULT_HIERARCHY_TYPES].map((t) => (t === first ? 'something-else' : t));
    expect(setHierarchyTypes(swapped)).toBe(true);
    expect(canvasState.hierarchyTypes.has('something-else')).toBe(true);
    expect(canvasState.hierarchyTypes.has(first)).toBe(false);
  });

  it('ticks exactly the checkboxes of the types in force', () => {
    document.body.innerHTML = '<input class="edge-tier-cb" data-type="a" type="checkbox"><input class="edge-tier-cb" data-type="b" type="checkbox" checked>';
    setHierarchyTypes(['a']);
    const [a, b] = [...document.querySelectorAll<HTMLInputElement>('.edge-tier-cb')];
    expect([a.checked, b.checked]).toEqual([true, false]);
  });
});

describe('setStackLeaves', () => {
  it('sets the option and its checkbox, and says whether it changed', () => {
    document.body.innerHTML = '<input id="stackLeaves" type="checkbox" checked>';
    const box = document.getElementById('stackLeaves') as HTMLInputElement;

    expect(setStackLeaves(false)).toBe(true);
    expect(canvasState.stackLeaves).toBe(false);
    expect(box.checked).toBe(false);

    expect(setStackLeaves(false)).toBe(false);
  });

  it('works when the page has no checkbox', () => {
    expect(setStackLeaves(false)).toBe(true);
  });
});

describe('updateRestorePositionsButton', () => {
  it('shows the button only while there are positions to restore', () => {
    document.body.innerHTML = '<button id="restorePositions" style="display: none"></button>';
    const btn = document.getElementById('restorePositions')!;

    canvasState.positionsBeforeLayout = { a: { x: 1, y: 2 } };
    updateRestorePositionsButton();
    expect(btn.style.display).toBe('');

    canvasState.positionsBeforeLayout = null;
    updateRestorePositionsButton();
    expect(btn.style.display).toBe('none');
  });

  it('does nothing when the page has no such button', () => {
    expect(() => updateRestorePositionsButton()).not.toThrow();
  });
});
