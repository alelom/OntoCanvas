/**
 * Removing an anonymous (blank-node) structure from the store completely: a restriction, a datatype
 * restriction with its facet list, an RDF list, … Removing only the triple that pointed at it would
 * leave the blank node's own triples behind, unreferenced, to be written out as stray statements.
 *
 * Also: collecting such a structure (with everything nested in it) alongside the statement that
 * points at it, and comparing two statements' structures regardless of blank-node ids.
 */
import type { Quad, Store } from 'n3';
import type { RdfTerm } from './classExpressions';

/** Remove a blank node's triples, then any blank node that leaves unreferenced (nested lists, facets…). */
export function removeBlankNodeClosure(store: Store, node: RdfTerm): void {
  if (node.termType !== 'BlankNode') return;
  for (const q of store.getQuads(node as never, null, null, null)) {
    store.removeQuad(q);
    const obj = q.object as RdfTerm;
    if (obj.termType === 'BlankNode' && store.getQuads(null, null, obj as never, null).length === 0) removeBlankNodeClosure(store, obj);
  }
}

/** A blank node's id without the `_:` some parsers keep on it, so both spellings name the same node. */
export function blankNodeId(blank: { id?: string; value?: string }): string {
  const raw = blank.id ?? blank.value ?? '';
  return raw.startsWith('_:') ? raw.slice(2) : raw;
}

function termKey(term: Quad['subject'] | Quad['object']): string {
  if (term.termType === 'BlankNode') return `_:${blankNodeId(term as never)}`;
  if (term.termType === 'Literal') return `"${term.value}"@${term.language}^^${term.datatype.value}`;
  return `<${term.value}>`;
}

const quadKey = (q: Quad): string => `${termKey(q.subject)} <${q.predicate.value}> ${termKey(q.object)}`;

/**
 * The triples of every blank node reachable from `quads` through blank-node objects — a restriction,
 * a class expression and the RDF list inside it, and so on, however deeply nested — leaving out any
 * already in `quads`. `triplesAbout` returns the triples whose subject is the given blank node.
 */
export function blankNodeClosureQuads(quads: readonly Quad[], triplesAbout: (blank: Quad['object']) => readonly Quad[]): Quad[] {
  const seen = new Set(quads.map(quadKey));
  const visited = new Set<string>();
  const found: Quad[] = [];
  const pending = quads.map((q) => q.object).filter((o) => o.termType === 'BlankNode');
  for (let blank = pending.pop(); blank; blank = pending.pop()) {
    const id = blankNodeId(blank as never);
    if (visited.has(id)) continue;
    visited.add(id);
    for (const q of triplesAbout(blank)) {
      const key = quadKey(q);
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(q);
      if (q.object.termType === 'BlankNode') pending.push(q.object);
    }
  }
  return found;
}

/**
 * Whether two sets of a statement's triples differ in structure. Blank-node ids drift between the
 * cache parse and the store parse, so blank nodes are compared by what they contain, recursively:
 * a restriction, or a union whose RDF list names a different member, is a change; a renumbered
 * blank node is not. Comparing only one level deep would not do — two lists can swap members
 * between them and still be made of the same list nodes.
 */
export function blockStructurallyChanged(original: readonly Quad[], current: readonly Quad[]): boolean {
  const a = structureSignatures(original);
  const b = structureSignatures(current);
  if (a.size !== b.size) return true;
  for (const [sig, count] of a) if (b.get(sig) !== count) return true;
  return false;
}

/**
 * A signature for a named-subject triple, with any blank-node object written out as its contents,
 * recursively, from the blank-node triples in `quads`. Equal signatures mean the same statement
 * content whatever the blank-node ids.
 */
export function structureSigner(quads: readonly Quad[]): (q: Quad) => string {
  const contents = blankNodeContents(quads);
  return (q) => `${termKey(q.subject)} <${q.predicate.value}> ${contents(q.object)}`;
}

function blankNodeContents(quads: readonly Quad[]): (term: Quad['object']) => string {
  const bySubject = new Map<string, Quad[]>();
  for (const q of quads) {
    if (q.subject.termType !== 'BlankNode') continue;
    const id = blankNodeId(q.subject as never);
    bySubject.set(id, [...(bySubject.get(id) ?? []), q]);
  }
  const contents = (term: Quad['object'], path: ReadonlySet<string>): string => {
    if (term.termType !== 'BlankNode') return termKey(term);
    const id = blankNodeId(term as never);
    if (path.has(id)) return '[cycle]';
    const inner = new Set(path).add(id);
    const parts = (bySubject.get(id) ?? []).map((q) => `<${q.predicate.value}> ${contents(q.object, inner)}`);
    return `[ ${parts.sort().join(' ; ')} ]`;
  };
  return (term) => contents(term, new Set());
}

/**
 * Each named-subject triple, and each blank node nothing points at, with blank nodes written out as
 * their contents. Blank nodes that only point at each other (`_:b1 :p _:b2 . _:b2 :p _:b1 .`) have
 * no such root, so the first of them not yet written out stands for the rest.
 */
function structureSignatures(quads: readonly Quad[]): Map<string, number> {
  const sign = structureSigner(quads);
  const contents = blankNodeContents(quads);
  const referenced = new Set(quads.filter((q) => q.object.termType === 'BlankNode').map((q) => blankNodeId(q.object as never)));
  const sigs = new Map<string, number>();
  const add = (sig: string): void => { sigs.set(sig, (sigs.get(sig) ?? 0) + 1); };
  const covered = new Set<string>();
  const cover = (term: Quad['object']): void => {
    if (term.termType !== 'BlankNode' || covered.has(blankNodeId(term as never))) return;
    covered.add(blankNodeId(term as never));
    for (const q of quads) if (q.subject.equals(term)) cover(q.object);
  };
  for (const q of quads) {
    if (q.subject.termType !== 'BlankNode') {
      add(sign(q));
      cover(q.object);
    } else if (!referenced.has(blankNodeId(q.subject as never))) {
      referenced.add(blankNodeId(q.subject as never));
      add(contents(q.subject));
      cover(q.subject);
    }
  }
  for (const q of quads) {
    if (q.subject.termType !== 'BlankNode' || covered.has(blankNodeId(q.subject as never))) continue;
    add(contents(q.subject));
    cover(q.subject);
  }
  return sigs;
}
