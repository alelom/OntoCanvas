import { DataFactory, Parser, Store, Writer } from 'n3';
import type { GraphData, GraphEdge, GraphNode } from './types';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';

export function extractLocalName(uri: string): string {
  if (uri.includes('#')) return uri.split('#').pop()!;
  if (uri.includes('/')) return uri.split('/').pop()!;
  return uri;
}

function isBlankNode(term: { termType: string }): boolean {
  return term.termType === 'BlankNode';
}

export interface ParseResult {
  graphData: GraphData;
  store: Store;
}

/**
 * Parse TTL string and extract OWL classes with subClassOf, partOf, contains.
 * Returns both graph data and the N3 Store for editing/serialization.
 */
export async function parseTtlToGraph(ttlString: string): Promise<ParseResult> {
  const parser = new Parser({ format: 'text/turtle' });
  const quads = parser.parse(ttlString);
  const store = new Store(quads);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenClasses = new Set<string>();

  const excludeNamespaces = [
    'http://www.w3.org/2002/07/owl#',
    'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    'http://www.w3.org/2000/01/rdf-schema#',
  ];

  // Get all OWL classes
  const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
  for (const q of classQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    const uri = subj.value;
    if (excludeNamespaces.some((ns) => uri.startsWith(ns))) continue;
    const localName = extractLocalName(uri);
    if (seenClasses.has(localName)) continue;
    seenClasses.add(localName);

    const labelQuad = store.getQuads(subj, RDFS + 'label', null, null)[0];
    const label = labelQuad?.object?.value ?? localName;

    let labellableRoot: boolean | null = null;
    const outQuads = store.getQuads(subj, null, null, null);
    for (const oq of outQuads) {
      if (oq.predicate.value.endsWith('labellableRoot')) {
        const val = oq.object.value;
        const str = String(val).toLowerCase();
        if (val === true || str === 'true') labellableRoot = true;
        else if (val === false || str === 'false') labellableRoot = false;
        break;
      }
    }

    nodes.push({ id: localName, label, labellableRoot });
  }

  // subClassOf edges
  const subClassQuads = store.getQuads(null, RDFS + 'subClassOf', null, null);
  const seenPairs = new Set<string>();

  for (const q of subClassQuads) {
    const subj = q.subject;
    const obj = q.object;
    if (subj.termType !== 'NamedNode') continue;

    const subjUri = subj.value;
    const subjName = extractLocalName(subjUri);
    if (!seenClasses.has(subjName)) continue;

    if (obj.termType === 'NamedNode') {
      const objName = extractLocalName(obj.value);
      if (!seenClasses.has(objName)) continue;
      const key = `${objName}->${subjName}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      edges.push({ from: objName, to: subjName, type: 'subClassOf' });
    } else if (isBlankNode(obj)) {
      const onProperty = store.getQuads(obj, OWL + 'onProperty', null, null)[0];
      const someValuesFrom = store.getQuads(obj, OWL + 'someValuesFrom', null, null)[0];
      if (!onProperty || !someValuesFrom) continue;
      const target = someValuesFrom.object;
      if (target.termType !== 'NamedNode') continue;
      const targetName = extractLocalName(target.value);
      if (!seenClasses.has(targetName)) continue;
      const propName = extractLocalName(onProperty.object.value);

      if (propName === 'partOf') {
        const key1 = `${subjName}->${targetName}`;
        const key2 = `${targetName}->${subjName}`;
        if (!seenPairs.has(key1)) {
          seenPairs.add(key1);
          edges.push({ from: subjName, to: targetName, type: 'partOf' });
        }
        if (!seenPairs.has(key2)) {
          seenPairs.add(key2);
          edges.push({ from: targetName, to: subjName, type: 'contains' });
        }
      } else {
        const key = `${subjName}->${targetName}`;
        if (!seenPairs.has(key)) {
          seenPairs.add(key);
          edges.push({ from: subjName, to: targetName, type: propName });
        }
      }
    }
  }

  return { graphData: { nodes, edges }, store };
}

/**
 * Update rdfs:label for a class in the store. localName is the class id (e.g. "FacadeCladding").
 */
export function updateLabelInStore(
  store: Store,
  localName: string,
  newLabel: string
): boolean {
  const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
  for (const q of classQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    if (extractLocalName(subj.value) !== localName) continue;

    const labelQuads = store.getQuads(subj, RDFS + 'label', null, null);
    const graph = labelQuads[0]?.graph ?? DataFactory.defaultGraph();
    for (const lq of labelQuads) {
      store.removeQuad(lq);
    }
    store.addQuad(
      subj,
      DataFactory.namedNode(RDFS + 'label'),
      DataFactory.literal(newLabel),
      graph
    );
    return true;
  }
  return false;
}

/**
 * Serialize the store to Turtle string.
 */
export function storeToTurtle(store: Store): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new Writer();
    for (const q of store) {
      writer.addQuad(q);
    }
    writer.end((err: Error | null, result: string) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}
