/**
 * What a double-click does on what the individuals layer draws (#239): on a drawn individual, it draws the individuals linked to
 * it, as "Show with neighbours" in the Individuals tab does; on the node of a class of the data, it draws that class's
 * individuals, as its count badge does. Display only, so it works in a read-only embedded view too. Any other node is left to
 * the editing double-click.
 */
import { INDIVIDUAL_CLASS_PREFIX, INDIVIDUAL_PREFIX, type IndividualsLayer } from '../abox/individualsLayer';

/** Whether the double-click on `nodeId` was taken. */
export function individualDoubleClick(nodeId: string, layer: Pick<IndividualsLayer, 'showNeighbours' | 'showClass'>): boolean {
  if (nodeId.startsWith(INDIVIDUAL_CLASS_PREFIX)) {
    layer.showClass(nodeId.slice(INDIVIDUAL_CLASS_PREFIX.length));
    return true;
  }
  if (nodeId.startsWith(INDIVIDUAL_PREFIX)) {
    layer.showNeighbours(nodeId.slice(INDIVIDUAL_PREFIX.length));
    return true;
  }
  return false;
}
