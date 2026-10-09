/**
 * The owl:Thing node that data properties with rdfs:domain owl:Thing are drawn under, once, instead of
 * under every class (#80). It is added for display only and behaves like an imported class: dimmed and
 * read-only. Its id is the full owl:Thing IRI, so an owl:Thing node already on the graph is reused.
 */
import type { DataPropertyInfo, GraphData } from '../types';

export const OWL_THING_URI = 'http://www.w3.org/2002/07/owl#Thing';

const THING_BOX_PREFIX = `__dataprop__${OWL_THING_URI}__`;

/** The node id of the box drawn under owl:Thing for the data property `name`. */
export const thingBoxId = (name: string): string => THING_BOX_PREFIX + name;

/** Split a selection into the data properties whose box under owl:Thing is selected (by name) and every
 * other selected id. Deleting such a box deletes the property, so the caller must see all of them. */
export function splitThingBoxSelection(selectedIds: string[]): { names: string[]; others: string[] } {
  const names: string[] = [];
  const others: string[] = [];
  for (const id of selectedIds) {
    if (id.startsWith(THING_BOX_PREFIX)) names.push(id.slice(THING_BOX_PREFIX.length));
    else others.push(id);
  }
  return { names, others };
}

/** `graph` with an owl:Thing node added when clustering is on and some data property has domain
 * owl:Thing; otherwise `graph` itself. The input graph is not changed. */
export function withThingNode(
  graph: GraphData,
  dataProperties: Pick<DataPropertyInfo, 'domains' | 'hasGlobalDomain'>[],
  cluster: boolean
): GraphData {
  if (!cluster || !dataProperties.some((dp) => dp.hasGlobalDomain && dp.domains.length === 0)) return graph;
  if (graph.nodes.some((n) => n.id === OWL_THING_URI)) return graph;
  return {
    ...graph,
    nodes: [
      ...graph.nodes,
      {
        id: OWL_THING_URI,
        label: 'Thing',
        labellableRoot: null,
        comment: 'owl:Thing, the class of everything. The data properties under it have rdfs:domain owl:Thing, so they apply to every class.',
        isExternal: true,
        externalOntologyUrl: 'http://www.w3.org/2002/07/owl',
      },
    ],
  };
}
