/**
 * SHACL validation of the open ontology and the data added to it (#231), in the browser, with shacl-engine.
 *
 * Measured for #231 (100k quads of readings like ADIRO's, two node shapes): shacl-engine 3.2 s, about three times faster than
 * rdf-validate-shacl, and 16 KB gzipped against 36 KB. It is loaded on the first check, as the SPARQL engine is on the first query.
 *
 * - The data is the RDF merge of every graph of every store, as the SPARQL default graph is (#224): each triple once.
 * - The shapes run one at a time, with a pause between them, so the page stays responsive, the progress can be shown, and Stop
 *   takes effect at the next shape.
 * - Shapes with SPARQL-based constraints or targets (sh:sparql, sh:target) are not run: shacl-engine runs one SPARQL query per
 *   focus node, about 40 ms each, which took 220 s on 5,000 focus nodes. They are listed as not checked, so no one reads a
 *   report without them as "conforms".
 */
import { DataFactory, type Store } from 'n3';
import type * as RDF from '@rdfjs/types';
import { mergedTriples } from '../sparql/unionSource';
import { QueryStopped } from '../sparql/readCapped';

const SH = 'http://www.w3.org/ns/shacl#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const TARGETS = ['targetClass', 'targetNode', 'targetSubjectsOf', 'targetObjectsOf', 'target'].map((t) => SH + t);
const CLASSES = ['http://www.w3.org/2000/01/rdf-schema#Class', 'http://www.w3.org/2002/07/owl#Class'];
const SPARQL_KEYS = [SH + 'sparql', SH + 'target', SH + 'select'];

export type Severity = 'Violation' | 'Warning' | 'Info';

export interface CheckTerm {
  termType: 'NamedNode' | 'BlankNode' | 'Literal';
  value: string;
  datatype?: string;
  language?: string;
}

/** One step of a result's path: its properties (several for an alternative path), backwards, repeated. */
export interface PathStep {
  predicates: string[];
  inverse: boolean;
  quantifier: 'one' | 'zeroOrOne' | 'zeroOrMore' | 'oneOrMore';
}

export interface CheckResult {
  /** The shape that was run (with a target), which the report groups by. */
  shape: CheckTerm;
  severity: Severity;
  focusNode: CheckTerm;
  path: PathStep[] | null;
  value: CheckTerm | null;
  message: string;
  /** The constraint that failed, by its local name (MinCountConstraintComponent). */
  constraint: string;
}

export interface CheckReport {
  results: CheckResult[];
  /** How many shapes were run. */
  checked: number;
  /** The shapes with SPARQL-based constraints or targets: not run (see above). */
  notChecked: CheckTerm[];
  conforms: boolean;
}

export interface ValidateOptions {
  signal?: AbortSignal;
  /** Called before each shape is run: how many are done, of how many. */
  onProgress?: (done: number, total: number) => void;
  /** Defaults to the lazily loaded shacl-engine. */
  loadValidator?: () => Promise<ValidatorClass>;
}

/** The part of shacl-engine's Validator this needs. */
export type ValidatorClass = new (dataset: RDF.DatasetCore, options: { factory: unknown }) => {
  validate(data: { dataset: unknown }, shapes?: { terms: RDF.Term[] }[]): Promise<{ results: EngineResult[] }>;
};

interface EngineResult {
  focusNode: { term: RDF.Term };
  severity: RDF.Term;
  message: RDF.Literal[];
  path: { predicates: RDF.Term[]; start: 'subject' | 'object'; quantifier: PathStep['quantifier'] }[] | null;
  value?: { term: RDF.Term };
  constraintComponent: RDF.Term;
}

const lazyValidator = (): Promise<ValidatorClass> =>
  import('shacl-engine/Validator.js').then((m: { default: unknown }) => m.default as ValidatorClass);

/** Lets the page draw, and Stop be clicked, between two shapes. */
const pause = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const termOf = (term: RDF.Term): CheckTerm => ({
  termType: term.termType === 'Literal' ? 'Literal' : term.termType === 'BlankNode' ? 'BlankNode' : 'NamedNode',
  value: term.value,
  ...(term.termType === 'Literal' && term.language ? { language: term.language } : {}),
  ...(term.termType === 'Literal' && !term.language ? { datatype: term.datatype.value } : {}),
});

const localName = (iri: string): string => iri.slice(Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/')) + 1);

/** The stores as the one dataset shacl-engine reads: what `match` finds is the RDF merge, so a triple stated twice counts once. */
export function mergedDataset(stores: Store[]): RDF.DatasetCore {
  const factory = DataFactory as unknown as RDF.DataFactory;
  const readOnly = (): never => {
    throw new Error('The data is read-only.');
  };
  return {
    get size() {
      return stores.reduce((sum, store) => sum + store.size, 0);
    },
    match(s, p, o) {
      const quads = [...mergedTriples(stores, s ?? null, p ?? null, o ?? null, factory)];
      return { size: quads.length, [Symbol.iterator]: () => quads[Symbol.iterator]() } as unknown as RDF.DatasetCore;
    },
    has: (quad) => mergedTriples(stores, quad.subject, quad.predicate, quad.object, factory).next().done === false,
    add: readOnly,
    delete: readOnly,
    [Symbol.iterator]: () => mergedTriples(stores, null, null, null, factory),
  };
}

/** Whether anything reachable from the shape (its property shapes, its lists) is SPARQL-based. */
function usesSparql(shapes: Store, shape: RDF.Term): boolean {
  const seen = new Set<string>();
  const visit = (node: RDF.Term): boolean => {
    const key = `${node.termType}:${node.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    for (const quad of shapes.getQuads(node as never, null, null, null)) {
      if (SPARQL_KEYS.includes(quad.predicate.value)) return true;
      if (quad.object.termType === 'BlankNode' && visit(quad.object)) return true;
    }
    return false;
  };
  return visit(shape);
}

/** The shapes that are run: those with a target, and the node shapes that are classes too (their target is implicit). */
export function shapesToRun(shapes: Store): RDF.Term[] {
  const found = new Map<string, RDF.Term>();
  const keep = (term: RDF.Term): void => void found.set(`${term.termType}:${term.value}`, term);
  for (const predicate of TARGETS) for (const quad of shapes.getQuads(null, predicate, null, null)) keep(quad.subject);
  for (const quad of shapes.getQuads(null, RDF_TYPE, SH + 'NodeShape', null)) {
    if (CLASSES.some((c) => shapes.getQuads(quad.subject, RDF_TYPE, c, null).length)) keep(quad.subject);
  }
  return [...found.values()];
}

function toResult(shape: RDF.Term, result: EngineResult): CheckResult {
  const severity = localName(result.severity.value);
  return {
    shape: termOf(shape),
    severity: severity === 'Warning' || severity === 'Info' ? severity : 'Violation',
    focusNode: termOf(result.focusNode.term),
    path: result.path?.length
      ? result.path.map((step) => ({ predicates: step.predicates.map((p) => p.value), inverse: step.start === 'object', quantifier: step.quantifier }))
      : null,
    // A node shape gives the focus node itself as the value: said once.
    value: result.value?.term && !result.value.term.equals(result.focusNode.term) ? termOf(result.value.term) : null,
    message: result.message.map((m) => m.value).join(' '),
    constraint: localName(result.constraintComponent.value),
  };
}

/** Checks the data against the shapes. Rejects with QueryStopped when stopped. */
export async function validateShapes(shapes: Store, data: Store[], options: ValidateOptions = {}): Promise<CheckReport> {
  const { signal, onProgress } = options;
  const Validator = await (options.loadValidator ?? lazyValidator)();
  const all = shapesToRun(shapes);
  const notChecked = all.filter((shape) => usesSparql(shapes, shape));
  const toRun = all.filter((shape) => !notChecked.includes(shape));
  const validator = new Validator(shapes as unknown as RDF.DatasetCore, { factory: DataFactory });
  const dataset = mergedDataset(data);
  const results: CheckResult[] = [];
  for (const [i, shape] of toRun.entries()) {
    onProgress?.(i, toRun.length);
    await pause();
    if (signal?.aborted) throw new QueryStopped();
    const report = await validator.validate({ dataset }, [{ terms: [shape] }]);
    results.push(...report.results.map((result) => toResult(shape, result)));
  }
  onProgress?.(toRun.length, toRun.length);
  return { results, checked: toRun.length, notChecked: notChecked.map(termOf), conforms: results.length === 0 };
}
