import { DataFactory, Parser, Store, Writer, BlankNode } from 'n3';
import type { GraphData, GraphEdge, GraphNode, AnnotationPropertyInfo } from './types';

const XSD = 'http://www.w3.org/2001/XMLSchema#';
const XSD_BOOLEAN = XSD + 'boolean';

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
  annotationProperties: AnnotationPropertyInfo[];
}

export function getAnnotationProperties(store: Store): AnnotationPropertyInfo[] {
  const result: AnnotationPropertyInfo[] = [];
  const seen = new Set<string>();
  // Find all subjects with rdfs:range xsd:boolean (iterate all quads to avoid getQuads matching issues)
  const RDFS_RANGE = RDFS + 'range';
  const booleanRangeSubjectUris = new Set<string>();
  for (const q of store) {
    const predVal = (q.predicate as { value?: string; id?: string }).value ?? (q.predicate as { value?: string; id?: string }).id;
    if (predVal !== RDFS_RANGE) continue;
    const obj = q.object as { value?: string; id?: string };
    const rangeVal = obj?.value ?? obj?.id;
    if (typeof rangeVal === 'string' && (rangeVal === XSD_BOOLEAN || rangeVal.endsWith('#boolean'))) {
      const subjUri = (q.subject as { value: string }).value ?? (q.subject as { id: string }).id;
      if (subjUri) booleanRangeSubjectUris.add(subjUri);
    }
  }
  const apQuads = store.getQuads(null, RDF + 'type', OWL + 'AnnotationProperty', null);
  for (const q of apQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    const subjUri = (subj as { value: string }).value;
    const name = extractLocalName(subjUri);
    if (seen.has(name)) continue;
    seen.add(name);
    const isBoolean = booleanRangeSubjectUris.has(subjUri);
    result.push({ name, isBoolean });
  }
  return result;
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
  const annotationProps = getAnnotationProperties(store);

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
    const annotations: Record<string, string | boolean | null> = {};
    const outQuads = store.getQuads(subj, null, null, null);
    for (const oq of outQuads) {
      const predName = extractLocalName(oq.predicate.value);
      const isAnnotation = annotationProps.some((ap) => ap.name === predName);
      if (!isAnnotation) continue;
      const obj = oq.object;
      const apInfo = annotationProps.find((ap) => ap.name === predName);
      if (apInfo?.isBoolean) {
        const val = obj.value;
        const str = String(val).toLowerCase();
        const b = val === true || str === 'true' ? true : val === false || str === 'false' ? false : null;
        annotations[predName] = b;
        if (predName === 'labellableRoot') labellableRoot = b;
      } else {
        annotations[predName] = obj.value != null ? String(obj.value) : null;
      }
    }

    nodes.push({ id: localName, label, labellableRoot, annotations });
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

  return { graphData: { nodes, edges }, store, annotationProperties: annotationProps };
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

function findLabellablePredicate(store: Store): string | null {
  for (const q of store) {
    if (q.predicate.value.endsWith('labellableRoot')) {
      return q.predicate.value;
    }
  }
  return null;
}

/**
 * Update labellableRoot for a class in the store.
 */
export function updateLabellableInStore(
  store: Store,
  localName: string,
  labellable: boolean
): boolean {
  const XSD = 'http://www.w3.org/2001/XMLSchema#';
  const predUri = findLabellablePredicate(store);
  const labellablePredicate = predUri
    ? DataFactory.namedNode(predUri)
    : DataFactory.namedNode('http://example.org/aec-drawing-ontology#labellableRoot');

  const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
  for (const q of classQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    if (extractLocalName(subj.value) !== localName) continue;

    const outQuads = store.getQuads(subj, null, null, null);
    for (const oq of outQuads) {
      if (oq.predicate.value.endsWith('labellableRoot')) {
        store.removeQuad(oq);
      }
    }
    const graph = store.getQuads(subj, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
    store.addQuad(
      subj,
      labellablePredicate,
      DataFactory.literal(String(labellable), DataFactory.namedNode(XSD + 'boolean')),
      graph
    );
    return true;
  }
  return false;
}

const TURTLE_PREFIXES: Record<string, string> = {
  '': 'http://example.org/aec-drawing-ontology#',
  owl: 'http://www.w3.org/2002/07/owl#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  xml: 'http://www.w3.org/XML/1998/namespace',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
};

const SECTION_DIVIDER = '#################################################################';
const SECTION_ORDER = [
  { type: 'Ontology', label: 'Ontology' },
  { type: 'AnnotationProperty', label: 'Annotation properties' },
  { type: 'ObjectProperty', label: 'Object Properties' },
  { type: 'Class', label: 'Classes' },
];

const BASE_IRI = 'http://example.org/aec-drawing-ontology#';

function toClassUri(localName: string): string {
  return BASE_IRI + localName;
}

function getPropertyUri(edgeType: string): string {
  return BASE_IRI + edgeType;
}

function findRestrictionBlank(
  store: Store,
  classLocalName: string,
  propertyLocalName: string,
  targetLocalName: string
): import('n3').BlankNode | null {
  const classUri = toClassUri(classLocalName);
  const subClassQuads = store.getQuads(
    DataFactory.namedNode(classUri),
    DataFactory.namedNode(RDFS + 'subClassOf'),
    null,
    null
  );
  const propUri = getPropertyUri(propertyLocalName);
  const targetUri = toClassUri(targetLocalName);
  for (const q of subClassQuads) {
    const obj = q.object;
    if (obj.termType !== 'BlankNode') continue;
    const onProp = store.getQuads(obj, DataFactory.namedNode(OWL + 'onProperty'), null, null)[0];
    const someFrom = store.getQuads(obj, DataFactory.namedNode(OWL + 'someValuesFrom'), null, null)[0];
    if (!onProp || !someFrom) continue;
    const onPropObj = onProp.object as { value?: string };
    const someFromObj = someFrom.object as { value?: string };
    if (onPropObj?.value !== propUri || someFromObj?.value !== targetUri) continue;
    return obj as import('n3').BlankNode;
  }
  return null;
}

/**
 * Update an edge in the store when reconnecting (moving arrow head or tail to a different node).
 * Supports subClassOf (direct rdfs:subClassOf quads) and partOf/contains (OWL restrictions).
 */
export function updateEdgeInStore(
  store: Store,
  oldFrom: string,
  oldTo: string,
  edgeType: string,
  newFrom: string,
  newTo: string
): boolean {
  if (edgeType === 'subClassOf') {
    const subjUri = toClassUri(oldTo);
    const objUri = toClassUri(oldFrom);
    const subClassOfPred = DataFactory.namedNode(RDFS + 'subClassOf');
    const quads = store.getQuads(
      DataFactory.namedNode(subjUri),
      subClassOfPred,
      DataFactory.namedNode(objUri),
      null
    );
    if (quads.length === 0) return false;
    const graph = quads[0].graph ?? DataFactory.defaultGraph();
    for (const q of quads) store.removeQuad(q);
    store.addQuad(
      DataFactory.namedNode(toClassUri(newTo)),
      subClassOfPred,
      DataFactory.namedNode(toClassUri(newFrom)),
      graph
    );
    return true;
  }
  // Restriction-based edges
  if (edgeType !== 'subClassOf') {
    if (!removeEdgeFromStore(store, oldFrom, oldTo, edgeType)) return false;
    return addEdgeToStore(store, newFrom, newTo, edgeType);
  }
  return false;
}

/**
 * Add a new OWL class (node) to the store.
 * Returns the new localName, or null on failure.
 */
export function addNodeToStore(
  store: Store,
  label: string,
  localName?: string
): string | null {
  const existingIds = new Set<string>();
  const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
  for (const q of classQuads) {
    const subj = q.subject;
    if (subj.termType === 'NamedNode') {
      existingIds.add(extractLocalName((subj as { value: string }).value));
    }
  }
  let id = localName ?? (extractLocalName(label) || 'NewClass');
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) id = 'NewClass';
  let base = id;
  let n = 0;
  while (existingIds.has(id)) {
    id = `${base}${++n}`;
  }
  const subjUri = toClassUri(id);
  const subject = DataFactory.namedNode(subjUri);
  const graph = store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
  store.addQuad(subject, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Class'), graph);
  store.addQuad(subject, DataFactory.namedNode(RDFS + 'label'), DataFactory.literal(label || id), graph);
  return id;
}

/**
 * Remove a node (OWL class) from the store.
 */
export function removeNodeFromStore(store: Store, localName: string): boolean {
  const subjUri = toClassUri(localName);
  const subject = DataFactory.namedNode(subjUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;
  for (const q of quads) store.removeQuad(q);
  return true;
}

/**
 * Add an edge to the store. Supports subClassOf (direct quad) and partOf/contains (OWL restrictions).
 */
export function addEdgeToStore(
  store: Store,
  from: string,
  to: string,
  edgeType: string
): boolean {
  if (edgeType === 'subClassOf') {
    const subjUri = toClassUri(to);
    const objUri = toClassUri(from);
    const subClassOfPred = DataFactory.namedNode(RDFS + 'subClassOf');
    const existing = store.getQuads(
      DataFactory.namedNode(subjUri),
      subClassOfPred,
      DataFactory.namedNode(objUri),
      null
    );
    if (existing.length > 0) return false;
    const graph = store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
    store.addQuad(
      DataFactory.namedNode(subjUri),
      subClassOfPred,
      DataFactory.namedNode(objUri),
      graph
    );
    return true;
  }
  // Any edge type other than subClassOf is stored as an OWL restriction (onProperty + someValuesFrom)
  if (edgeType !== 'subClassOf') {
    if (findRestrictionBlank(store, from, edgeType, to)) return false;
    const graph = store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
    const blank = new BlankNode();
    const fromUri = DataFactory.namedNode(toClassUri(from));
    const propUri = DataFactory.namedNode(getPropertyUri(edgeType));
    const toUri = DataFactory.namedNode(toClassUri(to));
    const restrictionType = DataFactory.namedNode(OWL + 'Restriction');
    const subClassOfPred = DataFactory.namedNode(RDFS + 'subClassOf');
    const onPropertyPred = DataFactory.namedNode(OWL + 'onProperty');
    const someValuesFromPred = DataFactory.namedNode(OWL + 'someValuesFrom');
    const rdfType = DataFactory.namedNode(RDF + 'type');
    store.addQuad(fromUri, subClassOfPred, blank, graph);
    store.addQuad(blank, rdfType, restrictionType, graph);
    store.addQuad(blank, onPropertyPred, propUri, graph);
    store.addQuad(blank, someValuesFromPred, toUri, graph);
    return true;
  }
  return false;
}

/**
 * Remove an edge from the store. Supports subClassOf (direct quads) and any restriction-backed
 * edge type (onProperty + someValuesFrom), including partOf, contains, hasFunction, hasMaterial, etc.
 */
export function removeEdgeFromStore(
  store: Store,
  from: string,
  to: string,
  edgeType: string
): boolean {
  if (edgeType === 'subClassOf') {
    const subjUri = toClassUri(to);
    const objUri = toClassUri(from);
    const quads = store.getQuads(
      DataFactory.namedNode(subjUri),
      DataFactory.namedNode(RDFS + 'subClassOf'),
      DataFactory.namedNode(objUri),
      null
    );
    if (quads.length === 0) return false;
    for (const q of quads) store.removeQuad(q);
    return true;
  }
  // Any non-subClassOf edge type is stored as an OWL restriction; remove by onProperty + someValuesFrom
  const blank = findRestrictionBlank(store, from, edgeType, to);
  if (!blank) return false;
  const fromUri = DataFactory.namedNode(toClassUri(from));
  const subClassOfQuads = store.getQuads(fromUri, DataFactory.namedNode(RDFS + 'subClassOf'), blank, null);
  for (const q of subClassOfQuads) store.removeQuad(q);
  const blankQuads = store.getQuads(blank, null, null, null);
  for (const q of blankQuads) store.removeQuad(q);
  const blankAsObjQuads = store.getQuads(null, null, blank, null);
  for (const q of blankAsObjQuads) store.removeQuad(q);
  return true;
}

function formatTurtleWithSections(raw: string): string {
  let output = raw;

  // Ensure @base is present when output uses relative IRIs (<#...>)
  if (output.includes('<#') && !output.includes('@base')) {
    const lastPrefixMatch = output.match(/@prefix[^\n]+\n?/g);
    const insertAt = lastPrefixMatch
      ? output.indexOf(lastPrefixMatch[lastPrefixMatch.length - 1]) +
        lastPrefixMatch[lastPrefixMatch.length - 1].length
      : 0;
    output =
      output.slice(0, insertAt) +
      `@base <${BASE_IRI}> .\n` +
      output.slice(insertAt);
  }

  const lines = output.split('\n');
  const result: string[] = [];
  const seenSections = new Set<string>();
  const sectionPatterns = [
    { type: 'Ontology', re: /(owl:Ontology|owl#Ontology|Ontology>)/ },
    { type: 'AnnotationProperty', re: /(owl:AnnotationProperty|owl#AnnotationProperty|AnnotationProperty>)/ },
    { type: 'ObjectProperty', re: /(owl:ObjectProperty|owl#ObjectProperty|ObjectProperty>)/ },
    { type: 'Class', re: /(owl:Class|owl#Class|owl\/Class|Class>)/ },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const isNewBlock = trimmed.length > 0 && !line.startsWith(' ') && !line.startsWith('\t');

    if (isNewBlock) {
      let addedSectionDivider = false;
      for (const { type, re } of sectionPatterns) {
        if (re.test(line)) {
          if (!seenSections.has(type)) {
            seenSections.add(type);
            const config = SECTION_ORDER.find((s) => s.type === type);
            if (config) {
              if (result.length > 0) result.push('');
              result.push(SECTION_DIVIDER);
              result.push(`#    ${config.label}`);
              result.push(SECTION_DIVIDER);
              result.push('');
              addedSectionDivider = true;
            }
          }
          break;
        }
      }
      if (!addedSectionDivider && result.length > 0 && result[result.length - 1].trim() !== '') {
        result.push('');
      }
    }
    result.push(line);
  }
  return result.join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * Serialize the store to Turtle string with section dividers and spacing.
 */
export function storeToTurtle(store: Store): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new Writer({
      prefixes: TURTLE_PREFIXES,
      baseIRI: 'http://example.org/aec-drawing-ontology#',
    });
    for (const q of store) {
      writer.addQuad(q);
    }
    writer.end((err: Error | null, result: string) => {
      if (err) reject(err);
      else resolve(formatTurtleWithSections(result));
    });
  });
}
