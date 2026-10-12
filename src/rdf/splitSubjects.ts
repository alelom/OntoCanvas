/**
 * A subject described in more than one Turtle statement (#118), e.g. a restriction added to a class
 * after the property it uses has been declared:
 *
 *   :Layout rdf:type owl:Class ; rdfs:label "Layout" .
 *   …
 *   :Layout rdfs:subClassOf [ … ] .
 *
 * The minimal-diff serializer compares each statement with the store. It must compare it with the
 * triples that statement holds, not with all of the subject's: otherwise the first statement "holds"
 * a restriction its text has no line for, and every save rewrites (or fails on) both statements.
 */
import { DataFactory, Parser, type Quad, type Store } from 'n3';
import { blankNodeClosureQuads, structureSigner } from './blankNodes';
import { parseTurtleBase, parseTurtlePrefixes, resolveTurtlePrefixedName } from './turtlePrefixes';

interface Statement {
  type: string;
  subject?: string;
  originalText: string;
}

/**
 * Share a subject's named-subject triples out among the statements that describe it, given each
 * statement's own triples (with their blank-node structure). A triple goes to the statement that
 * holds the same one. An edited triple goes where its predicate lost a triple (the value it
 * replaced); an added one, to the first statement with its predicate, or else to the first
 * statement. `sign` signs the shared triples; see `structureSigner`.
 *
 * The same sharing applies one level down, to the lines of one statement that repeat a predicate (#121).
 */
export function assignToStatements(triples: readonly Quad[], sign: (q: Quad) => string, statements: readonly (readonly Quad[])[]): Quad[][] {
  // What each statement held and has not been matched yet, as signature -> predicates.
  const remaining = statements.map((quads) => {
    const signOwn = structureSigner(quads);
    return quads.filter((q) => q.subject.termType !== 'BlankNode').map((q) => ({ sig: signOwn(q), predicate: q.predicate.value }));
  });
  const take = (i: number, match: (held: { sig: string; predicate: string }) => boolean): boolean => {
    const at = remaining[i].findIndex(match);
    if (at >= 0) remaining[i].splice(at, 1);
    return at >= 0;
  };
  const shares: Quad[][] = statements.map(() => []);
  const unmatched: Quad[] = [];
  for (const q of triples) {
    const sig = sign(q);
    // A triple the source states twice is one triple in the store, and each statement keeps it.
    const holders = remaining.map((_, k) => k).filter((k) => take(k, (held) => held.sig === sig));
    if (holders.length === 0) unmatched.push(q);
    for (const k of holders) shares[k].push(q);
  }
  const holds = (quads: readonly Quad[], predicate: string): boolean => quads.some((o) => o.subject.termType !== 'BlankNode' && o.predicate.value === predicate);
  for (const q of unmatched) {
    const replaced = remaining.findIndex((_, k) => take(k, (held) => held.predicate === q.predicate.value));
    const i = replaced >= 0 ? replaced : statements.findIndex((quads) => holds(quads, q.predicate.value));
    shares[Math.max(i, 0)].push(q);
  }
  return shares;
}

/** The triples one statement's text holds, read with the file's header (prefixes, base) in front of it. */
export function statementTriples(header: string, text: string): Quad[] | null {
  try {
    return new Parser().parse(`${header}\n${text}`);
  } catch {
    return null;
  }
}

/** The file's header text, and a resolver for the subjects its statements are written with (prefixed names, `<#relative>` IRIs). */
export function statementContext(blocks: readonly Statement[]): { header: string; subjectUri: (block: Statement) => string | null } {
  const headers = blocks.filter((b) => b.type === 'Header').map((b) => b.originalText);
  const prefixes = new Map<string, string>();
  for (const text of headers) parseTurtlePrefixes(text, prefixes);
  const base = parseTurtleBase(headers.join('\n'));
  return {
    header: headers.join('\n'),
    subjectUri: (block) => (block.type === 'Header' || !block.subject ? null : resolveTurtlePrefixedName(block.subject, prefixes, base)),
  };
}

/** The statements of each subject described more than once, keyed by the subject's URI. */
export function splitSubjects<T extends Statement>(blocks: readonly T[], subjectUri: (block: T) => string | null): Map<string, T[]> {
  const bySubject = new Map<string, T[]>();
  for (const block of blocks) {
    const uri = subjectUri(block);
    if (uri) bySubject.set(uri, [...(bySubject.get(uri) ?? []), block]);
  }
  for (const [uri, statements] of bySubject) if (statements.length < 2) bySubject.delete(uri);
  return bySubject;
}

/**
 * For every statement of a subject described more than once, the subject's triples in the store
 * that belong to it now. Statements of other subjects are absent: they hold all their subject's triples.
 */
export function currentSplitShares<T extends Statement & { quads: readonly unknown[] }>(store: Store, blocks: readonly T[]): Map<T, Quad[]> {
  const { subjectUri } = statementContext(blocks);
  const shares = new Map<T, Quad[]>();
  for (const [uri, statements] of splitSubjects(blocks, subjectUri)) {
    const triples = store.getQuads(DataFactory.namedNode(uri), null, null, null);
    const sign = structureSigner([...triples, ...blankNodeClosureQuads(triples, (b) => store.getQuads(b, null, null, null))]);
    assignToStatements(triples, sign, statements.map((s) => s.quads as readonly Quad[])).forEach((share, i) => shares.set(statements[i], share));
  }
  return shares;
}
