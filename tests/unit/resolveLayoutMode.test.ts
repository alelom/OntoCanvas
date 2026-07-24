/**
 * Guards that removed/legacy layout modes fall back to the default DAG layout.
 *
 * Loaded styling configs may still reference the old numbered modes
 * (hierarchical00/01/02/03) or the 'weighted' alias. Those no longer exist, so when no
 * match is found the resolver must return 'hierarchical-dag' (issue #19).
 */
import { describe, it, expect } from 'vitest';
import {
  resolveLayoutMode,
  DEFAULT_LAYOUT_MODE,
  LAYOUT_ALGORITHMS,
} from '../../src/layouts';

describe('resolveLayoutMode', () => {
  it('defaults to hierarchical-dag', () => {
    expect(DEFAULT_LAYOUT_MODE).toBe('hierarchical-dag');
  });

  it('keeps modes that exist in the registry', () => {
    for (const key of Object.keys(LAYOUT_ALGORITHMS)) {
      expect(resolveLayoutMode(key)).toBe(key);
    }
  });

  it("keeps the physics 'force' mode (not in the algorithm registry)", () => {
    expect(resolveLayoutMode('force')).toBe('force');
  });

  it('falls back to DAG for removed numbered modes and the weighted alias', () => {
    for (const stale of [
      'hierarchical00',
      'hierarchical01',
      'hierarchical02',
      'hierarchical03',
      'weighted',
    ]) {
      expect(resolveLayoutMode(stale)).toBe('hierarchical-dag');
    }
  });

  it('falls back to DAG for unknown, empty, null or undefined values', () => {
    expect(resolveLayoutMode('nonsense')).toBe('hierarchical-dag');
    expect(resolveLayoutMode('')).toBe('hierarchical-dag');
    expect(resolveLayoutMode(null)).toBe('hierarchical-dag');
    expect(resolveLayoutMode(undefined)).toBe('hierarchical-dag');
  });

  it('no longer registers the removed numbered modes', () => {
    for (const stale of ['hierarchical00', 'hierarchical01', 'hierarchical02', 'hierarchical03', 'weighted']) {
      expect(stale in LAYOUT_ALGORITHMS).toBe(false);
    }
  });
});
