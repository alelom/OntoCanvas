/**
 * Generic multi-value support for textual (non-boolean) annotation properties on a class.
 *
 * A class may carry several values for one textual annotation property (e.g. several
 * `:exampleImage` URLs). URL-like values are stored as IRIs (and shown as clickable links);
 * other values are stored as plain literals. This generalises the older exampleImage-only
 * helpers so every textual annotation property gets the same list + add + delete UI.
 */
import { DataFactory, Store } from 'n3';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const OWL = 'http://www.w3.org/2002/07/owl#';

/**
 * Whether a value should be treated as a link/IRI (clickable, stored as a NamedNode) rather than
 * a plain literal. True for absolute http(s) URLs and for scheme-less relative paths/filenames
 * (e.g. `img/photo.png`, `path/to/file`). False for free text (anything containing whitespace,
 * or with no slash and no file-extension-like suffix).
 */
export function isUrlLikeValue(value: string): boolean {
  const v = (value ?? '').trim();
  if (!v) return false;
  if (/^https?:\/\//i.test(v)) return true;
  if (/\s/.test(v)) return false;
  return v.includes('/') || /\.[a-z0-9]{1,8}$/i.test(v);
}

function extractLocalName(uri: string): string {
  if (uri.includes('#')) return uri.split('#').pop()!;
  if (uri.includes('/')) return uri.split('/').pop()!;
  return uri;
}

function findClassSubject(store: Store, classLocalName: string): { value: string } | null {
  const classQuads = store.getQuads(null, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Class'), null);
  for (const q of classQuads) {
    const subj = q.subject as { termType: string; value: string };
    if (subj.termType !== 'NamedNode') continue;
    if (extractLocalName(subj.value) === classLocalName) return subj;
  }
  return null;
}

/** All object values (IRI or literal) for a textual annotation property on a class, in document order. */
export function getAnnotationValuesForClass(store: Store, classLocalName: string, propertyUri: string): string[] {
  const subject = findClassSubject(store, classLocalName);
  if (!subject) return [];
  const quads = store.getQuads(DataFactory.namedNode(subject.value), DataFactory.namedNode(propertyUri), null, null);
  const values: string[] = [];
  for (const q of quads) {
    const v = (q.object as { value?: string }).value;
    if (typeof v === 'string') values.push(v);
  }
  return values;
}

/**
 * Replace all values of a textual annotation property on a class. URL-like values are written as
 * IRIs, others as literals. Empty/blank values are skipped. Returns false if the class is absent.
 */
export function setAnnotationValuesForClass(
  store: Store,
  classLocalName: string,
  propertyUri: string,
  values: string[]
): boolean {
  const subject = findClassSubject(store, classLocalName);
  if (!subject) return false;
  const pred = DataFactory.namedNode(propertyUri);
  const subjectNode = DataFactory.namedNode(subject.value);
  const existing = store.getQuads(subjectNode, pred, null, null);
  const graph = existing[0]?.graph ?? store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
  for (const q of existing) store.removeQuad(q);
  for (const raw of values) {
    const v = (raw ?? '').trim();
    if (!v) continue;
    const object = isUrlLikeValue(v) ? DataFactory.namedNode(v) : DataFactory.literal(v);
    store.addQuad(subjectNode, pred, object, graph);
  }
  return true;
}
