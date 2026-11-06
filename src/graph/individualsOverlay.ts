/**
 * Draws the individuals layer (#209) into the data the canvas is given, after the class graph is built: the nodes of
 * individuals look different from classes (ellipse, warm colour) and sit around the class node they belong to when it has a
 * position. Display only: nothing here reaches rawData, the ontology's store or the save pipeline.
 */
import type { DataSet } from 'vis-data';
import { INDIVIDUAL_PREFIX, type IndividualsLayer, type LayerClass } from '../abox/individualsLayer';
import { extractLocalName } from '../utils/localName';
import { definedByName } from '../abox/importedClasses';
import { relaxIndividuals, type FixedBox } from './individualsRelax';
import { filterIndividualsBySearch, type IndividualSearchFilter } from '../abox/individualSearch';

interface NetworkData {
  nodes: DataSet<any>;
  edges: DataSet<any>;
}

const INDIVIDUAL_FONT_SIZE = 14;
/** Where the stubs of classes with no node go: a column this far right of the class nodes, this far apart (#216). */
const STUB_OFFSET = 280;
const STUB_STEP = 130;
/** Class stubs per column, and the distance between columns. */
const STUB_ROWS = 10;
const STUB_COLUMN = 340;
/** The longest name an individual shows on the canvas; a longer one is cut in the middle. */
const MAX_LABEL = 30;

/** `text` up to MAX_LABEL characters: a longer one keeps its start and end around an ellipsis (a hash stays told apart by both). */
export function shortLabel(text: string, max = MAX_LABEL): string {
  if (text.length <= max) return text;
  const tail = Math.floor((max - 1) / 3);
  return `${text.slice(0, max - 1 - tail)}…${text.slice(text.length - tail)}`;
}
/** Room added between two stubs for each individual of them: a crowd around one must not run into the crowd of the next. */
const STUB_PER_INDIVIDUAL = 14;
const RING_RADIUS = 160;
const RING_STEP = 18;

/** The node id of each class that is drawn, by the class's IRI. */
export function classNodesByUri(nodes: Array<{ id: string; uri?: string }>): Map<string, string> {
  const byUri = new Map<string, string>();
  for (const node of nodes) if (node.uri) byUri.set(node.uri, node.id);
  return byUri;
}

/** The room a node already placed takes, estimated from its label (the canvas has not drawn it yet). */
function boxOf(node: { id: string; x: number; y: number; label?: string; font?: { size?: number } }): FixedBox {
  const lines = String(node.label ?? '').split('\n');
  const size = node.font?.size ?? 20;
  return { id: String(node.id), x: node.x, y: node.y, width: Math.max(80, Math.max(...lines.map((l) => l.length)) * size * 0.55 + 24), height: lines.length * size * 1.3 + 20 };
}

export function addIndividualsToNetworkData(data: NetworkData, layer: IndividualsLayer, classNodes: Map<string, string>, options: { relax?: boolean; search?: IndividualSearchFilter | null } = {}): { moreClasses: number } {
  // The classes of the data are drawn before any of their individuals is (#239), so only data with no individual adds nothing.
  const view = filterIndividualsBySearch(layer.build(classNodes), options.search ?? null);
  if (view.nodes.length === 0 && view.classes.length === 0) return { moreClasses: view.moreClasses };

  // Each individual goes on a ring around its first drawn class that has a position; the others are left to the layout.
  const classOf = new Map<string, string>();
  for (const edge of view.edges) if (edge.type === 'rdf:type' && !classOf.has(edge.from)) classOf.set(edge.from, edge.to);
  const placed = new Map<string, number>();
  const ringSize = new Map<string, number>();
  for (const node of view.nodes) {
    const cls = classOf.get(node.id);
    if (cls) ringSize.set(cls, (ringSize.get(cls) ?? 0) + 1);
  }

  addClassStubs(data, view.classes, view.edges);
  data.nodes.add(
    view.nodes.map((node) => {
      // A long name (a hash, an id) is cut in the middle on the canvas; the tooltip keeps it whole (#239).
      const label = shortLabel(node.label);
      const base = {
        id: node.id,
        label,
        title: label === node.label ? node.title : `${node.label}\n${node.title}`,
        shape: 'ellipse',
        color: { background: '#fdebd0', border: '#e67e22', highlight: { background: '#fad7a0', border: '#d35400' } },
        font: { size: INDIVIDUAL_FONT_SIZE },
        borderWidth: 1,
      };
      const cls = classOf.get(node.id);
      const anchor = cls ? (data.nodes.get(cls) as { x?: number; y?: number } | null) : null;
      if (!cls || typeof anchor?.x !== 'number' || typeof anchor.y !== 'number') return base;
      const index = placed.get(cls) ?? 0;
      placed.set(cls, index + 1);
      const angle = (2 * Math.PI * index) / (ringSize.get(cls) ?? 1);
      const radius = RING_RADIUS + Math.floor(index / 12) * RING_STEP;
      return { ...base, x: anchor.x + radius * Math.cos(angle), y: anchor.y + radius * Math.sin(angle) };
    })
  );
  if (options.relax ?? true) relax(data, view);
  data.edges.add(
    view.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      arrows: 'to',
      label: edge.type === 'rdf:type' ? '' : extractLocalName(edge.type),
      dashes: edge.type === 'rdf:type',
      color: { color: '#e67e22', highlight: '#d35400' },
      font: { size: 11, align: 'middle' },
      smooth: false,
    }))
  );
  return { moreClasses: view.moreClasses };
}

/**
 * A stub for each class of a drawn individual that is no node of the graph (imported, or never declared), so the individual
 * is joined to something (#216). Faded and dashed, like the classes of other ontologies. It goes in a column beside the class
 * nodes, where the individuals of it are then placed around it like around any class; with the classes unplaced (the physics
 * layout) the canvas places it.
 */
function addClassStubs(data: NetworkData, classes: LayerClass[], edges: Array<{ to: string }>): void {
  if (classes.length === 0) return;
  const placed = (data.nodes.get() as Array<{ id: string; x?: number; y?: number; label?: string; font?: { size?: number } }>)
    .filter((n) => typeof n.x === 'number' && typeof n.y === 'number')
    .map((n) => boxOf(n as Parameters<typeof boxOf>[0]));
  // Beside the graph, or from the origin when the graph is empty (data opened with no ontology, #234); left to the canvas when
  // the graph has nodes that are not placed yet.
  if (!placed.length && data.nodes.length > 0) {
    data.nodes.add(classes.map((c) => stubNode(c)));
    return;
  }
  const right = placed.length ? Math.max(...placed.map((b) => b.x + b.width / 2)) : -STUB_OFFSET;
  const middle = placed.length ? (Math.min(...placed.map((b) => b.y - b.height / 2)) + Math.max(...placed.map((b) => b.y + b.height / 2))) / 2 : 0;
  // In columns of STUB_ROWS (the classes of the data may be many, #239); in a column, each stub is as far from the one before as
  // the crowds of the two need.
  const crowd = classes.map((c) => edges.filter((e) => e.to === c.id).length);
  const position = new Map<string, { x: number; y: number }>();
  for (let start = 0; start < classes.length; start += STUB_ROWS) {
    const column = classes.slice(start, start + STUB_ROWS);
    const offsets: number[] = [];
    column.forEach((_, i) => offsets.push(i === 0 ? 0 : offsets[i - 1] + STUB_STEP + (STUB_PER_INDIVIDUAL * (crowd[start + i - 1] + crowd[start + i])) / 2));
    const centre = offsets[offsets.length - 1] / 2;
    const x = right + STUB_OFFSET + (start / STUB_ROWS) * STUB_COLUMN;
    column.forEach((c, i) => position.set(c.id, { x, y: middle + offsets[i] - centre }));
  }
  data.nodes.add(classes.map((c) => stubNode(c, position.get(c.id))));
}

/** The node of a class of the data that is no node of the graph, where it goes when that is known. */
function stubNode(c: LayerClass, at?: { x: number; y: number }) {
  return {
    id: c.id,
    // A class an import declares is named by it, with the ontology above as for imported terms (#111, #235); an undeclared
    // one keeps the dashed border of a stub.
    label: c.definedBy ? `(defined by: ${definedByName(c.definedBy)})\n${c.label}` : c.label,
    title:
      (c.definedBy
        ? `${c.iri}\nDeclared in ${c.definedBy}, an ontology loaded as context. A class of the individuals in the loaded data that is not a node of this graph.`
        : `${c.iri}\nA class of the individuals in the loaded data that is not a node of this graph.`) +
      // What a double-click on it does (#239), as its count badge.
      (c.count ? '\nDouble-click it, or its count, to draw its individuals.' : ''),
    shape: 'box',
    color: { background: '#f4f6f6', border: '#aab7b8', highlight: { background: '#eaeded', border: '#7b8a8b' } },
    font: { size: 18, color: '#7b8a8b' },
    borderWidth: 1,
    borderDashes: c.definedBy ? false : [5, 5],
    ...at,
    // The count of its individuals, drawn as the badge that draws them (#239).
    ...(c.count ? { individualCount: c.count } : {}),
  };
}

/**
 * What the view fits to after the individuals `drawn` (their IRIs) were added: their nodes, and the class nodes and stubs they
 * are joined to. Only what is in the data: a search may have hidden some. Empty when none is.
 */
export function focusNodeIds(data: NetworkData, drawn: string[]): string[] {
  const individuals = new Set(drawn.map((iri) => INDIVIDUAL_PREFIX + iri).filter((id) => data.nodes.get(id)));
  if (individuals.size === 0) return [];
  const ids = new Set(individuals);
  for (const edge of data.edges.get() as Array<{ from: string; to: string }>) {
    if (individuals.has(edge.from) && !edge.to.startsWith(INDIVIDUAL_PREFIX) && data.nodes.get(edge.to)) ids.add(edge.to);
  }
  return [...ids];
}

/** Moves the individuals by force relaxation, anchored to the nodes the layout already placed; the rest are left to the canvas. */
function relax(data: NetworkData, view: ReturnType<IndividualsLayer['build']>): void {
  const individualIds = new Set(view.nodes.map((n) => n.id));
  const fixed = (data.nodes.get() as Array<{ id: string; x?: number; y?: number; label?: string }>)
    .filter((n) => !individualIds.has(String(n.id)) && typeof n.x === 'number' && typeof n.y === 'number')
    .map((n) => boxOf(n as Parameters<typeof boxOf>[0]));
  // With the classes unplaced (the physics layout) there is nothing to anchor to: the canvas lays everything out.
  if (fixed.length === 0) return;
  const centre = { x: fixed.reduce((sum, f) => sum + f.x, 0) / fixed.length, y: fixed.reduce((sum, f) => sum + f.y, 0) / fixed.length };
  // Each takes the room of its label (an ellipse at the font size drawn).
  const movable = data.nodes.get(view.nodes.map((n) => n.id)).map((n: { id: string; x?: number; y?: number; label?: string }) => {
    const { width, height } = boxOf({ id: String(n.id), x: 0, y: 0, label: n.label, font: { size: INDIVIDUAL_FONT_SIZE } });
    return { id: String(n.id), x: n.x ?? centre.x, y: n.y ?? centre.y, width: width - 24 + 30, height: height - 20 + 14 };
  });
  const links = view.edges.map((e) => [e.from, e.to] as [string, string]);
  const placed = relaxIndividuals({ movable, fixed, links });
  data.nodes.update([...placed].map(([id, p]) => ({ id, x: p.x, y: p.y })));
}
