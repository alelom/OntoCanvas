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
/** Up to this many individuals in all, every one is drawn without being asked. */
export const DEFAULT_AUTO_MAX = 30;
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
  /** Set when the total cap cut what was asked for. */
  warning: string | null;
}

export interface IndividualsLayer {
  /** Draws the individual, on its own. */
  show(iri: string): void;
  /** Draws up to the cap of the neighbours of the individual that are not drawn yet, and the individual with them; asked again, the next ones. */
  showNeighbours(iri: string): void;
  /** Hides what is drawn, what was drawn by itself included, until the data changes. */
  clear(): void;
  /** Another ontology was opened: forgets what was asked for and the clearing, without telling the listeners (a redraw follows). */
  reset(): void;
  isEmpty(): boolean;
  /** Draws up to the cap of the individuals of a class that are not drawn yet, by label, without their neighbours. */
  showClass(classIri: string): void;
  /** Of the individuals of a class: `total`, how many are `displayed` now (however they came to be drawn), and how many the next request `adds` (up to the cap). */
  previewClass(classIri: string): { adds: number; displayed: number; total: number };
  /** Whether the individual is drawn now, however it came to be. */
  preview(iri: string): { shown: boolean; adds: number; displayed: number; total: number };
  /** Of the neighbours of the individual: `total`, how many are `displayed` now, and how many the next request `adds` (up to the cap). */
  previewNeighbours(iri: string): { adds: number; displayed: number; total: number };
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
  /** Draw every individual, unasked, while there are at most this many (30 by default; 0 for never). */
  autoMax?: number;
}

export function createIndividualsLayer({ getStores, maxPerExpansion = DEFAULT_MAX_PER_EXPANSION, maxTotal = DEFAULT_MAX_TOTAL, autoMax = DEFAULT_AUTO_MAX }: IndividualsLayerOptions): IndividualsLayer {
  /** The individuals asked for, in the order asked: one with its neighbours, or from a class. */
  const picked = new Set<string>();
  const listeners: Array<() => void> = [];
  let individuals: Set<string> | null = null;
  /** The user cleared what was drawn by itself. */
  let hidden = false;
  const auto = (): boolean => !hidden && known().size > 0 && known().size <= autoMax;
  const changed = (): void => {
    shownCache = null;
    listeners.forEach((listener) => listener());
  };

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

  /** The individuals linked to this one by an object property, either way, sorted by what is shown for them; kept until the data changes. */
  const neighbourCache = new Map<string, string[]>();
  const neighboursOf = (iri: string): string[] => {
    let cached = neighbourCache.get(iri);
    if (!cached) neighbourCache.set(iri, (cached = findNeighbours(iri)));
    return cached;
  };
  const findNeighbours = (iri: string): string[] => {
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

  /** Which individuals are drawn: those of the auto draw and the ones asked for. Kept until what is asked for changes. */
  let shownCache: { shown: Set<string>; cut: boolean } | null = null;
  const computeShown = (): { shown: Set<string>; cut: boolean } => {
    if (shownCache) return shownCache;
    const shown = new Set<string>();
    let cut = false;
    const add = (iri: string): boolean => {
      if (shown.has(iri)) return true;
      if (shown.size >= maxTotal) return (cut = true), false;
      shown.add(iri);
      return true;
    };
    if (auto()) for (const iri of known()) add(iri);
    for (const iri of picked) if (known().has(iri)) add(iri);
    // Full is as good as cut: nothing more can be drawn.
    cut = cut || shown.size >= maxTotal;
    return (shownCache = { shown, cut });
  };

  /** How many more individuals fit under the total cap, and how many a request adds at most. */
  const room = (): number => Math.max(0, maxTotal - computeShown().shown.size);
  const batch = (): number => Math.min(maxPerExpansion, room());

  /** The individuals of a class, sorted by what is shown for them; kept until the data changes. */
  const memberCache = new Map<string, string[]>();
  const membersOf = (classIri: string): string[] => {
    let members = memberCache.get(classIri);
    if (!members) {
      const found = new Set<string>();
      for (const store of getStores()) for (const q of store.getQuads(null, RDF_TYPE, classIri, null)) if (known().has(q.subject.value)) found.add(q.subject.value);
      members = [...found].map((iri) => ({ iri, text: labelOf(iri) })).sort((a, b) => byText(a.text, b.text) || (a.iri < b.iri ? -1 : 1)).map((m) => m.iri);
      memberCache.set(classIri, members);
    }
    return members;
  };

  return {
    show(iri) {
      if (!computeShown().shown.has(iri) && room() === 0) return;
      picked.add(iri);
      changed();
    },
    showNeighbours(iri) {
      const fit = room();
      const { shown } = computeShown();
      // The individual comes first, and takes a place of its own when it is not drawn yet.
      const places = shown.has(iri) ? fit : fit - 1;
      if (places < 0) return;
      picked.add(iri);
      for (const neighbour of neighboursOf(iri).filter((n) => !picked.has(n)).slice(0, Math.min(maxPerExpansion, places))) picked.add(neighbour);
      changed();
    },
    clear() {
      if (picked.size === 0 && !auto()) return;
      picked.clear();
      hidden = true;
      changed();
    },
    reset() {
      picked.clear();
      hidden = false;
      individuals = null;
      shownCache = null;
      neighbourCache.clear();
      memberCache.clear();
    },
    showClass(classIri) {
      const { shown } = computeShown();
      for (const iri of membersOf(classIri).filter((m) => !shown.has(m)).slice(0, batch())) picked.add(iri);
      changed();
    },
    previewClass(classIri) {
      const members = membersOf(classIri);
      const { shown } = computeShown();
      const displayed = members.filter((m) => shown.has(m)).length;
      return { adds: Math.min(members.length - displayed, batch()), displayed, total: members.length };
    },
    preview(iri) {
      const shown = computeShown().shown.has(iri);
      return { shown, adds: shown || room() === 0 ? 0 : 1, displayed: shown ? 1 : 0, total: 1 };
    },
    previewNeighbours(iri) {
      const neighbours = neighboursOf(iri);
      const { shown } = computeShown();
      const displayed = neighbours.filter((n) => shown.has(n)).length;
      return { adds: Math.min(neighbours.length - displayed, batch()), displayed, total: neighbours.length };
    },
    isEmpty: () => picked.size === 0 && !auto(),
    invalidate() {
      individuals = null;
      shownCache = null;
      neighbourCache.clear();
      memberCache.clear();
      hidden = false;
      for (const iri of [...picked]) if (!known().has(iri)) picked.delete(iri);
      if (picked.size > 0 || auto()) changed();
    },
    onChange: (listener) => void listeners.push(listener),

    build(classNodeByUri) {
      const { shown, cut } = computeShown();

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
      return { nodes, edges, warning: cut ? `Showing the first ${maxTotal} individuals, the limit. Clear individuals, or filter for a narrower set, to see others.` : null };
    },
  };
}
