/**
 * Whether the editor may write an edge back to the ontology (edit it or delete it on its own), and if
 * not, why. Both cases are read-only for now; see the tracking issue for what would make them editable.
 *
 * - `restriction`: a restriction kind the store writers don't understand (∀ ∋ ⟲, unqualified
 *   cardinality); they would rewrite it as ∃ (#63).
 * - `classExpression`: an edge drawn from a class expression in the property's domain or range (∪ ∩ ¬ {}).
 *   The writers treat an edge as one rdfs:domain / rdfs:range pair, so deleting it removed the range
 *   every member shares, and editing it added an rdfs:domain beside the union, turning OR into AND (#58).
 */
import type { GraphEdge } from '../types';
import { isEditableRestriction } from '../rdf/restrictions';

export type EdgeLock = 'restriction' | 'classExpression';

/** Decided from where the parser drew the edge (`fromClassExpression`), not from the display groups: those
 * leave out expressions too small to mark, and match properties by local name. */
export function edgeLock(edge: Pick<GraphEdge, 'restrictionKinds' | 'fromClassExpression'>): EdgeLock | null {
  if (!isEditableRestriction(edge)) return 'restriction';
  if (edge.fromClassExpression) return 'classExpression';
  return null;
}
