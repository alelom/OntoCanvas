/**
 * The bottom bar's description of the current selection, and resolving the term behind a node or edge.
 * Moved out of main.ts (#175).
 */
import { getTermLookup, getTermLink } from '../graph/canvasHelpers';
import { type ResolvedTerm, resolveNodeTerm, resolveEdgeTerm } from '../lib/termUri';
import { session } from '../state/appState';
import { updateSelectedTerm as updateStatusBarSelectedTerm, updateSelectionInfo as updateStatusBarSelection } from './statusBar';
import { Network } from 'vis-network/esnext';
import { INDIVIDUAL_CLASS_PREFIX, INDIVIDUAL_PREFIX, isIndividualEdgeId } from '../abox/individualsLayer';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

type Drawn = { get(id: string): { label?: string; property?: string } | null };
const drawn = (net: Network) => (net as unknown as { body?: { data: { nodes: Drawn; edges: Drawn } } }).body?.data;

/** The label a node is drawn with: an individual or a class of the data is not in the ontology's nodes. */
const drawnLabel = (net: Network, id: string): string | undefined => drawn(net)?.nodes.get(id)?.label;

export function resolveTerm(kind: 'node' | 'edge', id: string): ResolvedTerm | null {
  return kind === 'node' ? resolveNodeTerm(id, getTermLookup()) : resolveEdgeTerm(id, getTermLookup());
}

export function updateSelectionInfoDisplay(net: Network): void {
  const nodeIds = net.getSelectedNodes().map(String);
  if (nodeIds.length === 0) {
    const edgeIds = net.getSelectedEdges().map(String);
    if (edgeIds.length === 1 && isIndividualEdgeId(edgeIds[0])) {
      // A link between individuals (#214 selects them): by its relationship; one to a class of the data is drawn with no label.
      const edge = drawn(net)?.edges.get(edgeIds[0]);
      updateStatusBarSelectedTerm(edge?.label || 'type', getTermLink(edge?.property ?? RDF_TYPE), ' (link between individuals)');
    } else if (edgeIds.length === 1) {
      const term = resolveTerm('edge', edgeIds[0]);
      updateStatusBarSelectedTerm(term?.label ?? edgeIds[0], getTermLink(term?.uri ?? null));
    } else if (edgeIds.length > 1) {
      updateStatusBarSelection(` | Selected: ${edgeIds.length} relationships`);
    } else {
      updateStatusBarSelection('');
    }
  } else if (nodeIds.length === 1 && (nodeIds[0].startsWith(INDIVIDUAL_PREFIX) || nodeIds[0].startsWith(INDIVIDUAL_CLASS_PREFIX))) {
    // An individual (#217: the search selects one it finds), or a class of the data drawn for them: by its label, with its IRI.
    const individual = nodeIds[0].startsWith(INDIVIDUAL_PREFIX);
    const iri = nodeIds[0].slice((individual ? INDIVIDUAL_PREFIX : INDIVIDUAL_CLASS_PREFIX).length);
    updateStatusBarSelectedTerm(drawnLabel(net, nodeIds[0]) ?? iri, getTermLink(iri), individual ? ' (individual)' : ' (class of the data)');
  } else if (nodeIds.length === 1) {
    const node = session.rawData.nodes.find((n) => n.id === nodeIds[0]);
    const term = resolveTerm('node', nodeIds[0]);
    updateStatusBarSelectedTerm(
      node?.label ?? term?.label ?? nodeIds[0],
      getTermLink(term?.uri ?? null),
      ` | Labellable: ${node?.labellableRoot ?? 'N/A'}`
    );
  } else {
    updateStatusBarSelection(` | Selected: ${nodeIds.length} nodes`);
  }
}
