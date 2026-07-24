/**
 * Single source of truth for the human-facing description of each layout mode.
 *
 * Used to populate the layout-mode dropdown's hint popup and the per-option native
 * tooltips. Order matches the dropdown; `id` matches the layout registry key (or `force`
 * for the physics layout). Keep this in sync with LAYOUT_ALGORITHMS — the unit test
 * `layoutModeInfo.test.ts` guards against drift.
 */
export interface LayoutModeInfo {
  /** Registry key (LAYOUT_ALGORITHMS) or `force`. */
  id: string;
  /** Label shown in the dropdown. */
  label: string;
  /** One- to two-sentence description of the underlying logic. */
  description: string;
}

export const LAYOUT_MODE_INFO: LayoutModeInfo[] = [
  {
    id: 'hierarchical-dag',
    label: 'Hierarchical DAG',
    description:
      'Ranks nodes by ALL relationships (object properties + subClassOf/contains), then places each parent centred over its children in tight tiers. Deterministic — the most compact and balanced hierarchical view. (Default.)',
  },
  {
    id: 'hierarchical-tiers-spring',
    label: 'Hierarchical tiers+spring',
    description:
      'Same relationship-based tiers as DAG, but within each tier nodes slide horizontally via a spring relaxation so connected nodes cluster together. More organic than DAG, still tier-aligned.',
  },
  {
    id: 'hierarchical-force-downward',
    label: 'Hierarchical force-downward',
    description:
      'A force simulation (nodes repel, edges attract) with a per-step downward pull toward each node\'s tier. Organic 2-D clusters while keeping roots near the top and leaves near the bottom.',
  },
  {
    id: 'force',
    label: 'Force-directed',
    description:
      'Physics simulation (vis-network Barnes–Hut): nodes repel and edges act as springs, with no enforced hierarchy. Good for exploring connectivity rather than top-down structure.',
  },
];

/** Look up a mode's info by id. */
export function getLayoutModeInfo(id: string): LayoutModeInfo | undefined {
  return LAYOUT_MODE_INFO.find((m) => m.id === id);
}
