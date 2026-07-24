/**
 * Guards that the layout-mode hint metadata stays in sync with the actual layout registry,
 * and that the hint popup renders every mode with the active one marked.
 */
import { describe, it, expect } from 'vitest';
import { LAYOUT_ALGORITHMS } from '../../src/layouts';
import { LAYOUT_MODE_INFO, getLayoutModeInfo } from '../../src/layouts/layoutModeInfo';
import { renderLayoutModeHint } from '../../src/ui/layoutModeHint';

describe('layout mode info', () => {
  it('has a description for every selectable registry mode (and force)', () => {
    const infoIds = new Set(LAYOUT_MODE_INFO.map((m) => m.id));
    // Every registry key must be documented.
    for (const key of Object.keys(LAYOUT_ALGORITHMS)) {
      expect(infoIds.has(key), `missing hint for registry mode "${key}"`).toBe(true);
    }
    // The physics mode is not in the registry but is in the dropdown.
    expect(infoIds.has('force')).toBe(true);
  });

  it('only documents modes that exist (no stale entries)', () => {
    const valid = new Set([...Object.keys(LAYOUT_ALGORITHMS), 'force']);
    for (const m of LAYOUT_MODE_INFO) {
      expect(valid.has(m.id), `stale hint entry "${m.id}"`).toBe(true);
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(20);
    }
  });

  it('has DAG as the first (default) entry', () => {
    expect(LAYOUT_MODE_INFO[0].id).toBe('hierarchical-dag');
    expect(getLayoutModeInfo('hierarchical-dag')?.label).toBe('Hierarchical DAG');
  });

  it('renders all modes with exactly one marked current', () => {
    const html = renderLayoutModeHint('hierarchical-dag');
    for (const m of LAYOUT_MODE_INFO) {
      expect(html).toContain(m.label);
    }
    expect((html.match(/— current/g) || []).length).toBe(1);
    // Unknown active id marks nothing.
    expect((renderLayoutModeHint('nope').match(/— current/g) || []).length).toBe(0);
  });
});
