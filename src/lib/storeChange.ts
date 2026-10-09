/**
 * Record what an edit changed in the store, as the exact triples removed and added, so undo can put
 * them back and redo can apply them again (#77). Rebuilding a deleted class through the writers
 * restores only what they know how to write (a label); replaying the triples restores everything:
 * comments, annotations, axioms and restrictions of any kind, with their original blank nodes.
 */
import type { Quad, Store, Term } from 'n3';
import type { GraphData, GraphEdge, GraphNode } from '../types';

export interface StoreChange {
  removed: Quad[];
  added: Quad[];
}

/** The store's triples, keyed so two snapshots can be compared. */
export type StoreSnapshot = Map<string, Quad>;

const termKey = (t: Term): string =>
  t.termType === 'Literal'
    ? `L"${t.value}"@${(t as { language?: string }).language ?? ''}^^${(t as { datatype?: { value: string } }).datatype?.value ?? ''}`
    : `${t.termType[0]}${t.value}`;
const quadKey = (q: Quad): string => [q.subject, q.predicate, q.object, q.graph].map(termKey).join(' ');

/** Take a snapshot of the store before an edit. */
export function snapshotStore(store: Store): StoreSnapshot {
  const snapshot: StoreSnapshot = new Map();
  for (const q of store.getQuads(null, null, null, null)) snapshot.set(quadKey(q), q);
  return snapshot;
}

/** What changed since `before`: the triples it had that the store no longer has, and the new ones. */
export function diffStore(before: StoreSnapshot, store: Store): StoreChange {
  const after = snapshotStore(store);
  const removed = [...before].filter(([k]) => !after.has(k)).map(([, q]) => q);
  const added = [...after].filter(([k]) => !before.has(k)).map(([, q]) => q);
  return { removed, added };
}

/** Undo a change: remove what it added and put back what it removed. */
export function revertStoreChange(store: Store, change: StoreChange): void {
  store.removeQuads(change.added);
  store.addQuads(change.removed);
}

/** Redo a change after it was reverted. */
export function reapplyStoreChange(store: Store, change: StoreChange): void {
  store.removeQuads(change.removed);
  store.addQuads(change.added);
}

/** The graph's nodes and edges at one moment, copied so later edits don't change them. */
export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function snapshotGraph(graph: GraphData): GraphSnapshot {
  return { nodes: graph.nodes.map((n) => ({ ...n })), edges: graph.edges.map((e) => ({ ...e })) };
}

/** Put the graph's nodes and edges back as they were in `snapshot`, in place (the snapshot stays reusable). */
export function restoreGraph(graph: GraphData, snapshot: GraphSnapshot): void {
  graph.nodes.splice(0, graph.nodes.length, ...snapshot.nodes.map((n) => ({ ...n })));
  graph.edges.splice(0, graph.edges.length, ...snapshot.edges.map((e) => ({ ...e })));
}
