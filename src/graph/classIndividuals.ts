/**
 * Individuals as the class node offers them (#209): the entry of its right-click menu, which draws the individuals of that
 * class in batches like the type header of the Individuals tab, and the count of individuals the node carries. Display only.
 */
import type { DataSet } from 'vis-data';
import { INDIVIDUAL_CLASS_PREFIX, isIndividualNodeId, limitTitle, type IndividualsLayer } from '../abox/individualsLayer';

export interface ClassIndividualsAction {
  label: string;
  title: string;
  disabled: boolean;
  /** How many the next press draws, and how many of the class are drawn now. */
  adds: number;
  displayed: number;
  run: () => void;
}

/** What the menu of a class node offers for its individuals; null when the class has none in the loaded data. */
export function classIndividualsAction(layer: IndividualsLayer, classIri: string): ClassIndividualsAction | null {
  const { adds, displayed, total } = layer.previewClass(classIri);
  if (total === 0) return null;
  const run = (): void => layer.showClass(classIri);
  if (displayed >= total) return { label: `All ${total} individuals displayed`, title: 'Every individual of this class is drawn', disabled: true, adds, displayed, run };
  if (adds === 0) {
    return { label: 'Limit reached', title: limitTitle(layer.limit), disabled: true, adds, displayed, run };
  }
  const more = displayed > 0 ? ' more' : '';
  return { label: `Show ${adds}${more} individuals (${displayed} displayed/${total} total)`, title: `Draw ${adds}${more} of the individuals of this class in the graph`, disabled: false, adds, displayed, run };
}

/** Records how many individuals the loaded data has on each class node that has any (none, no count); the canvas draws it as a badge. */
export function addIndividualCounts(nodes: DataSet<any>, layer: IndividualsLayer, classNodes: Map<string, string>): void {
  const updates: Array<{ id: string; individualCount: number }> = [];
  for (const [classIri, nodeId] of classNodes) {
    const { total } = layer.previewClass(classIri);
    if (total > 0 && nodes.get(nodeId)) updates.push({ id: nodeId, individualCount: total });
  }
  if (updates.length) nodes.update(updates);
}

/**
 * The class a node stands for: a class node of the graph, by its IRI, or the node of a class of the data that is no node of the
 * graph (#239). Null for anything else. Its count badge and its menu draw the individuals of that class.
 */
export function classIriOfNode(nodeId: string, graphNodes: Array<{ id: string; uri?: string | null }>): string | null {
  if (nodeId.startsWith(INDIVIDUAL_CLASS_PREFIX)) return nodeId.slice(INDIVIDUAL_CLASS_PREFIX.length);
  if (isIndividualNodeId(nodeId)) return null;
  return graphNodes.find((n) => n.id === nodeId)?.uri ?? null;
}
