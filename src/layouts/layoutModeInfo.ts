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
      'Tiers from the relationships ticked "Tiers" in Object Properties (subClassOf by default): a superclass above its subclasses, a container above what it contains. Each parent is centred over its children in tight tiers. Deterministic — the most compact hierarchical view. (Default.)',
  },
  {
    id: 'hierarchical-tiers-spring',
    label: 'Hierarchical tiers+spring',
    description:
      'Same tiers as DAG, but within each tier nodes slide horizontally via a spring relaxation so connected nodes cluster together, along every relationship. More organic than DAG, still tier-aligned.',
  },
  {
    id: 'hierarchical-force-downward',
    label: 'Hierarchical force-downward',
    description:
      'A force simulation (nodes repel, edges attract) with a per-step downward pull toward each node\'s tier. Organic 2-D clusters while keeping roots near the top and leaves near the bottom.',
  },
  {
    id: 'elk-layered',
    label: 'Layered (ELK)',
    description:
      'Same tiers as DAG, ordered and placed by ELK, the standard layered algorithm (fewer crossings, Brandes–Köpf placement). Loaded when first chosen; the DAG layout shows until it is ready.',
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
