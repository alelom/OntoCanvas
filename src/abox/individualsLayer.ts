/**
 * Individuals drawn in the graph (#209), on demand: the ones asked for, the individuals linked to each (one hop, both
 * directions), and an edge from each to the node of its class when that class is drawn. A layer of its own over the class
 * graph, like the external expansion: the classes, their layout and the save pipeline are not touched, and nothing here is
 * ever written. Capped per expansion and in total, so repeated expansion cannot fill the canvas.
 *
 * Pure of the DOM and of the canvas: stores in, plain nodes and edges out (`build`).
 */
import type { Store } from 'n3';
import { individualsOf, isClassOfIndividuals } from '../lib/instanceData';
import { extractLocalName } from '../utils/localName';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';

/** Ids of the nodes of individuals start with this, so nothing mistakes one for a class (not editable, not saved). */
export const INDIVIDUAL_PREFIX = '__individual__';
export const isIndividualNodeId = (id: string): boolean => id.startsWith(INDIVIDUAL_PREFIX);
/** Ids of the edges of individuals; they hold no "->", so no edit modal parses one. */
export const INDIVIDUAL_EDGE_PREFIX = '__individual_edge__';
export const isIndividualEdgeId = (id: string): boolean => id.startsWith(INDIVIDUAL_EDGE_PREFIX);

export const DEFAULT_MAX_PER_EXPANSION = 50;
export const DEFAULT_MAX_TOTAL = 300;
const TOOLTIP_ROWS = 10;
// One collator: `localeCompare` with options builds one per call.
const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
const byText = (a: string, b: string): number => collator.compare(a, b);

export interface LayerNode {
  id: string;
  iri: string;
  label: string;
  /** Plain text: the IRI, the classes and the data values. */
  title: string;
}

export interface LayerEdge {
  id: string;
  from: string;
  to: string;
  /** The property's IRI, or 'rdf:type' for the edge to a class. */
  type: string;
}

export interface LayerView {
  nodes: LayerNode[];
  edges: LayerEdge[];
  /** Individuals asked for that have neighbours not drawn yet. */
  more: Array<{ iri: string; label: string; hidden: number }>;
  /** Set when the total cap cut what was asked for. */
  warning: string | null;
}

export interface IndividualsLayer {
  /** Draws the individual and up to the cap of its neighbours. */
  show(iri: string): void;
  /** Draws up to the cap more of its neighbours. */
  showMore(iri: string): void;
  clear(): void;
  isEmpty(): boolean;
  /** The data changed (another ontology, data added or removed): what is drawn is read again, and what is gone is dropped. */
  invalidate(): void;
  /** `classNodeByUri`: the node id of each class that is drawn, by the class's IRI. */
  build(classNodeByUri: Map<string, string>): LayerView;
  onChange(listener: () => void): void;
}

export interface IndividualsLayerOptions {
  getStores: () => Store[];
  maxPerExpansion?: number;
  maxTotal?: number;
}

export function createIndividualsLayer({ getStores, maxPerExpansion = DEFAULT_MAX_PER_EXPANSION, maxTotal = DEFAULT_MAX_TOTAL }: IndividualsLayerOptions): IndividualsLayer {
  /** The individuals asked for, in the order asked, with how many of each one's neighbours are drawn. */
  const roots = new Map<string, number>();
  const listeners: Array<() => void> = [];
  let individuals: Set<string> | null = null;
  const changed = (): void => listeners.forEach((listener) => listener());

  const known = (): Set<string> => {
    if (!individuals) {
      individuals = new Set();
      for (const store of getStores()) for (const iri of individualsOf(store)) individuals.add(iri);
    }
    return individuals;
  };

  const labelOf = (iri: string): string => {
    for (const store of getStores()) {
      const labels = store.getQuads(iri, RDFS_LABEL, null, null).filter((q) => q.object.termType === 'Literal');
      const preferred = labels.find((q) => !(q.object as { language?: string }).language) ?? labels[0];
      if (preferred) return preferred.object.value;
    }
    return extractLocalName(iri);
  };

  /** The individuals linked to this one by an object property, either way, sorted by what is shown for them. */
  const neighboursOf = (iri: string): string[] => {
    const all = known();
    const found = new Set<string>();
    for (const store of getStores()) {
      for (const q of store.getQuads(iri, null, null, null)) {
        if (q.predicate.value !== RDF_TYPE && q.object.termType === 'NamedNode' && q.object.value !== iri && all.has(q.object.value)) found.add(q.object.value);
      }
      for (const q of store.getQuads(null, null, iri, null)) {
        if (q.predicate.value !== RDF_TYPE && q.subject.termType === 'NamedNode' && q.subject.value !== iri && all.has(q.subject.value)) found.add(q.subject.value);
      }
    }
    const withLabel = [...found].map((n) => ({ iri: n, text: labelOf(n) }));
    return withLabel.sort((a, b) => byText(a.text, b.text) || (a.iri < b.iri ? -1 : 1)).map((n) => n.iri);
  };

  const tooltipOf = (iri: string): string => {
    const lines = [iri];
    const classes: string[] = [];
    const values: string[] = [];
    for (const store of getStores()) {
      for (const q of store.getQuads(iri, null, null, null)) {
        if (q.predicate.value === RDF_TYPE) {
          if (q.object.termType === 'NamedNode' && isClassOfIndividuals(q.object.value)) classes.push(extractLocalName(q.object.value));
        } else if (q.object.termType === 'Literal' && q.predicate.value !== RDFS_LABEL) {
          values.push(`${extractLocalName(q.predicate.value)}: ${q.object.value}`);
        }
      }
    }
    if (classes.length) lines.push(`Class: ${classes.join(', ')}`);
    lines.push(...values.slice(0, TOOLTIP_ROWS));
    if (values.length > TOOLTIP_ROWS) lines.push(`…and ${values.length - TOOLTIP_ROWS} more`);
    return lines.join('\n');
  };

  return {
    show(iri) {
      if (!roots.has(iri)) roots.set(iri, maxPerExpansion);
      changed();
    },
    showMore(iri) {
      roots.set(iri, (roots.get(iri) ?? 0) + maxPerExpansion);
      changed();
    },
    clear() {
      if (roots.size === 0) return;
      roots.clear();
      changed();
    },
    isEmpty: () => roots.size === 0,
    invalidate() {
      individuals = null;
      for (const iri of [...roots.keys()]) if (!known().has(iri)) roots.delete(iri);
      if (roots.size > 0) changed();
    },
    onChange: (listener) => void listeners.push(listener),

    build(classNodeByUri) {
      const shown = new Set<string>();
      const more: LayerView['more'] = [];
      let cut = false;
      const add = (iri: string): boolean => {
        if (shown.has(iri)) return true;
        if (shown.size >= maxTotal) return (cut = true), false;
        shown.add(iri);
        return true;
      };
      for (const [iri, count] of roots) {
        if (!known().has(iri) || !add(iri)) continue;
        const neighbours = neighboursOf(iri);
        let drawn = 0;
        for (const neighbour of neighbours.slice(0, count)) if (add(neighbour)) drawn++;
        const hidden = neighbours.length - Math.min(neighbours.length, count);
        if (hidden > 0 && drawn === Math.min(neighbours.length, count)) more.push({ iri, label: labelOf(iri), hidden });
      }

      const nodes: LayerNode[] = [...shown].map((iri) => ({ id: INDIVIDUAL_PREFIX + iri, iri, label: labelOf(iri), title: tooltipOf(iri) }));
      const edges: LayerEdge[] = [];
      const seen = new Set<string>();
      const addEdge = (from: string, to: string, type: string): void => {
        const key = `${from}|${to}|${type}`;
        if (seen.has(key)) return;
        seen.add(key);
        edges.push({ id: `${INDIVIDUAL_EDGE_PREFIX}${edges.length}`, from, to, type });
      };
      for (const iri of shown) {
        for (const store of getStores()) {
          for (const q of store.getQuads(iri, null, null, null)) {
            if (q.predicate.value === RDF_TYPE) {
              const classNode = q.object.termType === 'NamedNode' ? classNodeByUri.get(q.object.value) : undefined;
              if (classNode) addEdge(INDIVIDUAL_PREFIX + iri, classNode, 'rdf:type');
            } else if (q.object.termType === 'NamedNode' && shown.has(q.object.value)) {
              addEdge(INDIVIDUAL_PREFIX + iri, INDIVIDUAL_PREFIX + q.object.value, q.predicate.value);
            }
          }
        }
      }
      return { nodes, edges, more, warning: cut ? `Showing the first ${maxTotal} individuals; clear some to see others.` : null };
    },
  };
}
