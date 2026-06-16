/**
 * Pure annotation-property styling logic (no DOM, no vis-network).
 *
 * Resolves a node's colour, border line type, and visibility from the annotation
 * styling configuration, using PRIORITY BY LIST ORDER: the first property (in the
 * given `order`) that *governs* a node decides that node's style.
 *
 * This module is deliberately side-effect free so it can be unit-tested directly,
 * per the project's testing-priority rule.
 */
import type { AnnotationStyleConfig, BorderLineType } from '../ui/constants';
import { COLORS, ANNOTATION_FILL_PALETTE } from '../ui/constants';

/**
 * Default fill colour for the annotation property at the given position. Wraps around the
 * palette when there are more properties than colours. Used so each property starts with a
 * distinct fill (e.g. the first is green, the second is not).
 */
export function defaultAnnotationFill(index: number): string {
  const palette = ANNOTATION_FILL_PALETTE;
  const i = ((Math.trunc(index) % palette.length) + palette.length) % palette.length;
  return palette[i];
}

/** A single annotation-property state's styling (whenTrue / whenFalse / whenUndefined). */
interface BoolStateStyle {
  fillColor: string;
  borderColor: string;
  borderLineType: BorderLineType;
  show: boolean;
}

/** The resolved styling for one node. `show: false` means hidden by annotation rules. */
export interface ResolvedNodeStyle {
  background: string;
  border: string;
  borderLineType: BorderLineType;
  show: boolean;
}

/** Default node styling when no annotation property governs a node. */
export const DEFAULT_NODE_STYLE: ResolvedNodeStyle = {
  background: COLORS.default,
  border: '#2c3e50',
  borderLineType: 'solid',
  show: true,
};

function styleFromBoolState(state: BoolStateStyle): ResolvedNodeStyle {
  return {
    background: state.fillColor,
    border: state.borderColor,
    borderLineType: state.borderLineType,
    show: state.show !== false,
  };
}

/**
 * Resolve a node's styling from the annotation config using priority by list order.
 *
 * Rules:
 * - Properties are evaluated in `order` (highest priority first).
 * - A **boolean** property *governs* a node when the node carries a concrete `true`/`false`
 *   value for it → returns that state's styling immediately.
 * - A **text** property *governs* when the node's string value matches one of its regex rules
 *   → returns that rule's styling.
 * - Properties the node does not carry (boolean value `undefined`/`null`, or text with no
 *   matching rule) are skipped — they never short-circuit a lower-priority property. This is
 *   the fix for the multi-property bug where the first property's `whenUndefined` colour
 *   used to claim every node.
 * - Fallback for nodes that no property governs: the **top-priority boolean property's**
 *   `whenUndefined` styling (the catch-all), or the default node style if there is none.
 *
 * @param annotations The node's annotation values, keyed by property local name.
 * @param config Boolean + text property styling, keyed by property local name.
 * @param order Property local names in priority order (highest first).
 */
export function resolveNodeAnnotationStyle(
  annotations: Record<string, string | boolean | null> | undefined,
  config: AnnotationStyleConfig,
  order: string[]
): ResolvedNodeStyle {
  const ann = annotations ?? {};
  let topBoolUndefined: ResolvedNodeStyle | null = null;

  for (const name of order) {
    const boolConfig = config.booleanProps[name];
    if (boolConfig) {
      if (topBoolUndefined === null) {
        topBoolUndefined = styleFromBoolState(boolConfig.whenUndefined);
      }
      const val = ann[name];
      if (val === true) return styleFromBoolState(boolConfig.whenTrue);
      if (val === false) return styleFromBoolState(boolConfig.whenFalse);
      // value undefined/null → property not carried by this node; keep looking.
      continue;
    }

    const textConfig = config.textProps[name];
    if (textConfig) {
      const val = ann[name];
      if (typeof val === 'string') {
        for (const rule of textConfig.rules) {
          if (!rule.regex) continue;
          try {
            if (new RegExp(rule.regex).test(val)) {
              return {
                background: rule.fillColor,
                border: rule.borderColor,
                borderLineType: rule.borderLineType,
                show: true,
              };
            }
          } catch {
            // invalid regex: skip this rule
          }
        }
      }
    }
  }

  return topBoolUndefined ?? DEFAULT_NODE_STYLE;
}

/**
 * Order annotation properties by a saved priority order.
 *
 * Properties whose names appear in `savedOrder` come first, in that order; any remaining
 * properties are appended in their existing input order. Names in `savedOrder` that are not
 * present in `props` are ignored. Returns a new array (does not mutate the input).
 */
export function applyAnnotationPropertyOrder<T extends { name: string }>(
  props: T[],
  savedOrder: string[] | undefined | null
): T[] {
  if (!savedOrder || savedOrder.length === 0) return [...props];
  const rank = new Map<string, number>();
  savedOrder.forEach((name, i) => {
    if (!rank.has(name)) rank.set(name, i);
  });
  const known = props.filter((p) => rank.has(p.name));
  const unknown = props.filter((p) => !rank.has(p.name));
  known.sort((a, b) => rank.get(a.name)! - rank.get(b.name)!);
  return [...known, ...unknown];
}

/**
 * Move the annotation property named `name` one step up (-1) or down (+1) in priority,
 * swapping it with the nearest neighbour of the SAME boolean/text kind. This keeps the
 * Boolean and Text groups intact (they are rendered as separate sections) while letting the
 * user reorder priority within a group. Returns a new array; the input is unchanged. If there
 * is no same-kind neighbour in that direction, the original order is returned.
 */
export function reorderAnnotationProperty<T extends { name: string; isBoolean: boolean }>(
  props: T[],
  name: string,
  direction: -1 | 1
): T[] {
  const idx = props.findIndex((p) => p.name === name);
  if (idx < 0) return [...props];
  const kind = props[idx].isBoolean;
  let j = idx + direction;
  while (j >= 0 && j < props.length && props[j].isBoolean !== kind) j += direction;
  if (j < 0 || j >= props.length) return [...props];
  const next = [...props];
  [next[idx], next[j]] = [next[j], next[idx]];
  return next;
}
