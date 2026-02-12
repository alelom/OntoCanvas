import { DataFactory, Parser, Store, Writer, BlankNode } from 'n3';
import { postProcessTurtle } from './turtlePostProcess';
import type { GraphData, GraphEdge, GraphNode, AnnotationPropertyInfo, ObjectPropertyInfo, DataPropertyInfo, DataPropertyRestriction } from './types';

const XSD = 'http://www.w3.org/2001/XMLSchema#';
const XSD_BOOLEAN = XSD + 'boolean';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';
const BASE_IRI = 'http://example.org/aec-drawing-ontology#';
const HAS_CARDINALITY_PROP = BASE_IRI + 'hasCardinality';

export function extractLocalName(uri: string): string {
  if (uri.includes('#')) return uri.split('#').pop()!;
  if (uri.includes('/')) return uri.split('/').pop()!;
  return uri;
}

// Re-export for convenience
export { extractLocalName as extractLocalNameFromUri };

function isBlankNode(term: { termType: string }): boolean {
  return term.termType === 'BlankNode';
}

function parseCardinalityFromRestriction(
  minQual: import('n3').Quad | undefined,
  maxQual: import('n3').Quad | undefined,
  qualCard: import('n3').Quad | undefined,
  minCard: import('n3').Quad | undefined,
  maxCard: import('n3').Quad | undefined,
  someValuesFrom: import('n3').Quad | undefined,
  propName?: string
): { minCardinality?: number | null; maxCardinality?: number | null } {
  const toInt = (q: import('n3').Quad | undefined): number | null =>
    q?.object?.value != null ? parseInt(String(q.object.value), 10) : null;
  const n = toInt(qualCard);
  if (n !== null && !isNaN(n)) {
    return { minCardinality: n, maxCardinality: n };
  }
  const minQ = toInt(minQual) ?? toInt(minCard);
  const maxQ = toInt(maxQual) ?? toInt(maxCard);
  if (minQ !== null && !isNaN(minQ)) {
    if (maxQ !== null && !isNaN(maxQ)) {
      return { minCardinality: minQ, maxCardinality: maxQ };
    }
    return { minCardinality: minQ, maxCardinality: null };
  }
  if (maxQ !== null && !isNaN(maxQ)) {
    return { minCardinality: null, maxCardinality: maxQ };
  }
  if (someValuesFrom) {
    return { minCardinality: propName === 'contains' ? 0 : 1, maxCardinality: null };
  }
  return {};
}

export interface ParseResult {
  graphData: GraphData;
  store: Store;
  annotationProperties: AnnotationPropertyInfo[];
  objectProperties: ObjectPropertyInfo[];
  dataProperties: DataPropertyInfo[];
}

function getObjectProperties(store: Store): ObjectPropertyInfo[] {
  const result: ObjectPropertyInfo[] = [];
  const seen = new Set<string>();
  const opQuads = store.getQuads(null, RDF + 'type', OWL + 'ObjectProperty', null);
  for (const q of opQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    const subjUri = (subj as { value: string }).value;
    const name = extractLocalName(subjUri);
    if (seen.has(name)) continue;
    seen.add(name);
    const labelQuad = store.getQuads(subj, RDFS + 'label', null, null)[0];
    const label = labelQuad?.object?.value ?? name;
    const commentQuad = store.getQuads(subj, RDFS + 'comment', null, null)[0];
    const comment = commentQuad?.object?.value != null ? String(commentQuad.object.value) : null;
    const hasCardQuad = store.getQuads(subj, DataFactory.namedNode(HAS_CARDINALITY_PROP), null, null)[0];
    let hasCardinality = true;
    if (hasCardQuad?.object) {
      const val = String((hasCardQuad.object as { value?: unknown }).value ?? '').toLowerCase();
      hasCardinality = val === 'true' || val === '"true"';
    }
    result.push({ name, label: String(label), hasCardinality, comment: comment || undefined });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
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

    const commentQuad = store.getQuads(subj, RDFS + 'comment', null, null)[0];
    const comment = commentQuad?.object?.value != null ? String(commentQuad.object.value) : null;

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

    nodes.push({
      id: localName,
      label,
      labellableRoot,
      comment: comment || undefined,
      annotations,
      dataPropertyRestrictions: [],
    });
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
      const key = `${subjName}->${objName}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      edges.push({ from: subjName, to: objName, type: 'subClassOf' });
    } else if (isBlankNode(obj)) {
      const onProperty = store.getQuads(obj, OWL + 'onProperty', null, null)[0];
      const someValuesFrom = store.getQuads(obj, OWL + 'someValuesFrom', null, null)[0];
      const onClass = store.getQuads(obj, OWL + 'onClass', null, null)[0];
      const minQual = store.getQuads(obj, OWL + 'minQualifiedCardinality', null, null)[0];
      const maxQual = store.getQuads(obj, OWL + 'maxQualifiedCardinality', null, null)[0];
      const qualCard = store.getQuads(obj, OWL + 'qualifiedCardinality', null, null)[0];
      const minCard = store.getQuads(obj, OWL + 'minCardinality', null, null)[0];
      const maxCard = store.getQuads(obj, OWL + 'maxCardinality', null, null)[0];

      const targetQuad = someValuesFrom ?? onClass;
      if (!onProperty || !targetQuad) continue;
      const target = targetQuad.object;
      if (target.termType !== 'NamedNode') continue;
      const targetName = extractLocalName(target.value);
      if (!seenClasses.has(targetName)) continue;
      const propName = extractLocalName(onProperty.object.value);

      const cardinality = parseCardinalityFromRestriction(
        minQual, maxQual, qualCard, minCard, maxCard, someValuesFrom, propName
      );

      const key = `${subjName}->${targetName}:${propName}`;
      if (!seenPairs.has(key)) {
        seenPairs.add(key);
        edges.push({ from: subjName, to: targetName, type: propName, ...cardinality });
      }
    }
  }

  const objectProps = getObjectProperties(store);
  const dataProps = getDataProperties(store);

  // Parse data property restrictions (class subClassOf [ owl:onProperty dp ; owl:onDataRange ... ])
  const OWL_ON_DATA_RANGE = OWL + 'onDataRange';
  for (const q of store.getQuads(null, RDFS + 'subClassOf', null, null)) {
    const subj = q.subject;
    const obj = q.object;
    if (subj.termType !== 'NamedNode' || !isBlankNode(obj)) continue;
    const onProp = store.getQuads(obj, OWL + 'onProperty', null, null)[0];
    const onDataRange = store.getQuads(obj, DataFactory.namedNode(OWL_ON_DATA_RANGE), null, null)[0];
    if (!onProp || !onDataRange) continue;
    const propName = extractLocalName((onProp.object as { value: string }).value);
    const minQ = store.getQuads(obj, OWL + 'minCardinality', null, null)[0];
    const maxQ = store.getQuads(obj, OWL + 'maxCardinality', null, null)[0];
    const cardQ = store.getQuads(obj, OWL + 'cardinality', null, null)[0];
    const toInt = (quad: import('n3').Quad | undefined): number | null =>
      quad?.object?.value != null ? parseInt(String(quad.object.value), 10) : null;
    let minCard: number | null = toInt(minQ);
    let maxCard: number | null = toInt(maxQ);
    const n = toInt(cardQ);
    if (n !== null && !isNaN(n)) {
      minCard = n;
      maxCard = n;
    }
    const subjName = extractLocalName((subj as { value: string }).value);
    const node = nodes.find((n) => n.id === subjName);
    if (node && node.dataPropertyRestrictions) {
      node.dataPropertyRestrictions.push({
        propertyName: propName,
        minCardinality: minCard ?? undefined,
        maxCardinality: maxCard ?? undefined,
      });
    }
  }

  return { graphData: { nodes, edges }, store, annotationProperties: annotationProps, objectProperties: objectProps, dataProperties: dataProps };
}

const XSD_NS = 'http://www.w3.org/2001/XMLSchema#';

function getDataProperties(store: Store): DataPropertyInfo[] {
  const result: DataPropertyInfo[] = [];
  const seen = new Set<string>();
  const dpQuads = store.getQuads(null, RDF + 'type', OWL + 'DatatypeProperty', null);
  const OWL_THING = OWL + 'Thing';
  for (const q of dpQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    const subjUri = (subj as { value: string }).value;
    const name = extractLocalName(subjUri);
    if (seen.has(name)) continue;
    seen.add(name);
    const labelQuad = store.getQuads(subj, RDFS + 'label', null, null)[0];
    const label = labelQuad?.object?.value ?? name;
    const commentQuad = store.getQuads(subj, RDFS + 'comment', null, null)[0];
    const comment = commentQuad?.object?.value != null ? String(commentQuad.object.value) : null;
    const rangeQuad = store.getQuads(subj, RDFS + 'range', null, null)[0];
    const range = rangeQuad?.object && (rangeQuad.object as { value?: string }).value
      ? (rangeQuad.object as { value: string }).value
      : XSD_NS + 'string';
    
    // Extract domain(s) - rdfs:domain can appear multiple times
    const domainQuads = store.getQuads(subj, RDFS + 'domain', null, null);
    const domains: string[] = [];
    for (const domainQuad of domainQuads) {
      const domainObj = domainQuad.object;
      if (domainObj.termType === 'NamedNode') {
        const domainUri = (domainObj as { value: string }).value;
        // If domain is owl:Thing, it means all classes (empty array)
        if (domainUri !== OWL_THING) {
          const domainName = extractLocalName(domainUri);
          if (!domains.includes(domainName)) {
            domains.push(domainName);
          }
        }
      }
    }
    // If no explicit domain or only owl:Thing, domains array is empty (meaning all classes)
    
    result.push({ name, label: String(label), comment: comment || undefined, range, domains });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
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
 * Update rdfs:comment for a class in the store.
 */
export function updateCommentInStore(
  store: Store,
  localName: string,
  comment: string | null
): boolean {
  const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
  const commentPred = DataFactory.namedNode(RDFS + 'comment');
  for (const q of classQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    if (extractLocalName(subj.value) !== localName) continue;

    const commentQuads = store.getQuads(subj, commentPred, null, null);
    const graph = commentQuads[0]?.graph ?? store.getQuads(subj, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
    for (const cq of commentQuads) store.removeQuad(cq);
    if (comment !== null && comment.trim() !== '') {
      store.addQuad(subj, commentPred, DataFactory.literal(comment.trim()), graph);
    }
    return true;
  }
  return false;
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

/**
 * Update an annotation property value for a class node in the store.
 * For boolean properties, value should be boolean or null.
 * For non-boolean properties, value should be string or null.
 */
export function updateAnnotationPropertyValueInStore(
  store: Store,
  classLocalName: string,
  annotationPropertyName: string,
  value: boolean | string | null,
  isBoolean: boolean
): boolean {
  // Find the class subject
  const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
  let classSubject: import('n3').NamedNode | null = null;
  for (const q of classQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    if (extractLocalName(subj.value) !== classLocalName) continue;
    classSubject = subj as import('n3').NamedNode;
    break;
  }
  
  if (!classSubject) return false;
  
  // Find the annotation property predicate URI
  let propUri: string | null = null;
  const apQuads = store.getQuads(null, RDF + 'type', OWL + 'AnnotationProperty', null);
  for (const q of apQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    const currentUri = (subj as { value: string }).value;
    if (extractLocalName(currentUri) === annotationPropertyName) {
      propUri = currentUri;
      break;
    }
  }
  
  // If not found, assume it's from base IRI
  if (!propUri) {
    propUri = BASE_IRI + annotationPropertyName;
  }
  
  const predicate = DataFactory.namedNode(propUri);
  
  // Remove existing quads for this annotation property
  const existingQuads = store.getQuads(classSubject, predicate, null, null);
  const graph = existingQuads[0]?.graph ?? DataFactory.defaultGraph();
  for (const q of existingQuads) {
    store.removeQuad(q);
  }
  
  // Add new quad if value is not null
  if (value !== null) {
    if (isBoolean) {
      const boolValue = value === true || value === 'true';
      store.addQuad(
        classSubject,
        predicate,
        DataFactory.literal(String(boolValue), DataFactory.namedNode(XSD + 'boolean')),
        graph
      );
    } else {
      store.addQuad(
        classSubject,
        predicate,
        DataFactory.literal(String(value)),
        graph
      );
    }
  }
  
  return true;
}

const TURTLE_PREFIXES: Record<string, string> = {
  '': 'http://example.org/aec-drawing-ontology#',
  owl: 'http://www.w3.org/2002/07/owl#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  xml: 'http://www.w3.org/XML/1998/namespace',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
};

function toClassUri(localName: string): string {
  return BASE_IRI + localName;
}

function getPropertyUri(edgeType: string): string {
  // If edgeType is already a full URI (starts with http:// or https://), return it as-is
  if (edgeType.startsWith('http://') || edgeType.startsWith('https://')) {
    return edgeType;
  }
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
    const onCls = store.getQuads(obj, DataFactory.namedNode(OWL + 'onClass'), null, null)[0];
    const targetQuad = someFrom ?? onCls;
    if (!onProp || !targetQuad) continue;
    const onPropObj = onProp.object as { value?: string };
    const targetObj = targetQuad.object as { value?: string };
    if (onPropObj?.value !== propUri || targetObj?.value !== targetUri) continue;
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
  newTo: string,
  cardinality?: { minCardinality?: number | null; maxCardinality?: number | null }
): boolean {
  if (edgeType === 'subClassOf') {
    const subjUri = toClassUri(oldFrom);
    const objUri = toClassUri(oldTo);
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
      DataFactory.namedNode(toClassUri(newFrom)),
      subClassOfPred,
      DataFactory.namedNode(toClassUri(newTo)),
      graph
    );
    return true;
  }
  // Restriction-based edges
  if (edgeType !== 'subClassOf') {
    if (!removeEdgeFromStore(store, oldFrom, oldTo, edgeType)) return false;
    return addEdgeToStore(store, newFrom, newTo, edgeType, cardinality);
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

function ensureHasCardinalityAnnotationProperty(store: Store): void {
  const apUri = DataFactory.namedNode(HAS_CARDINALITY_PROP);
  const existing = store.getQuads(apUri, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'AnnotationProperty'), null);
  if (existing.length > 0) return;
  const graph = store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
  store.addQuad(apUri, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'AnnotationProperty'), graph);
  store.addQuad(apUri, DataFactory.namedNode(RDFS + 'range'), DataFactory.namedNode(XSD + 'boolean'), graph);
}

/**
 * Add a new object property (relationship type) to the store.
 * Returns the property localName, or null on failure.
 */
export function addObjectPropertyToStore(
  store: Store,
  label: string,
  hasCardinality: boolean,
  localName?: string
): string | null {
  const existingNames = new Set(getObjectProperties(store).map((op) => op.name));
  let name = localName ?? (extractLocalName(label) || 'newProperty').replace(/\s+/g, '');
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) name = 'newProperty';
  let base = name;
  let n = 0;
  while (existingNames.has(name)) {
    name = `${base}${++n}`;
  }
  ensureHasCardinalityAnnotationProperty(store);
  const subjUri = BASE_IRI + name;
  const subject = DataFactory.namedNode(subjUri);
  const graph = store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
  store.addQuad(subject, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'ObjectProperty'), graph);
  store.addQuad(subject, DataFactory.namedNode(RDFS + 'label'), DataFactory.literal(label || name), graph);
  store.addQuad(subject, DataFactory.namedNode(RDFS + 'domain'), DataFactory.namedNode(OWL + 'Thing'), graph);
  store.addQuad(subject, DataFactory.namedNode(RDFS + 'range'), DataFactory.namedNode(OWL + 'Thing'), graph);
  store.addQuad(
    subject,
    DataFactory.namedNode(HAS_CARDINALITY_PROP),
    DataFactory.literal(String(hasCardinality), DataFactory.namedNode(XSD + 'boolean')),
    graph
  );
  return name;
}

/**
 * Update rdfs:label for an object property in the store.
 * Returns false for subClassOf or if property not found.
 */
export function updateObjectPropertyLabelInStore(
  store: Store,
  propertyName: string,
  newLabel: string
): boolean {
  if (propertyName === 'subClassOf') return false;
  const propUri = getPropertyUri(propertyName);
  const subject = DataFactory.namedNode(propUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;

  const labelPred = DataFactory.namedNode(RDFS + 'label');
  const labelQuads = store.getQuads(subject, labelPred, null, null);
  const graph = labelQuads[0]?.graph ?? quads[0]?.graph ?? DataFactory.defaultGraph();
  for (const lq of labelQuads) store.removeQuad(lq);
  store.addQuad(subject, labelPred, DataFactory.literal(newLabel.trim()), graph);
  return true;
}

/**
 * Update rdfs:comment for an object property in the store.
 * Returns false for subClassOf (standard RDFS property) or if property not found.
 */
export function updateObjectPropertyCommentInStore(
  store: Store,
  propertyName: string,
  comment: string | null
): boolean {
  if (propertyName === 'subClassOf') return false;
  const propUri = getPropertyUri(propertyName);
  const subject = DataFactory.namedNode(propUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;

  const commentPred = DataFactory.namedNode(RDFS + 'comment');
  const commentQuads = store.getQuads(subject, commentPred, null, null);
  const graph = commentQuads[0]?.graph ?? quads[0]?.graph ?? DataFactory.defaultGraph();
  for (const cq of commentQuads) store.removeQuad(cq);
  if (comment !== null && comment.trim() !== '') {
    store.addQuad(subject, commentPred, DataFactory.literal(comment.trim()), graph);
  }
  return true;
}

/**
 * Add a new data property (owl:DatatypeProperty) to the store.
 * Returns the property localName, or null on failure.
 */
export function addDataPropertyToStore(
  store: Store,
  label: string,
  rangeUri: string,
  localName?: string
): string | null {
  const existingNames = new Set(getDataProperties(store).map((dp) => dp.name));
  let name = localName ?? (extractLocalName(label) || 'newDataProperty').replace(/\s+/g, '');
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) name = 'newDataProperty';
  let base = name;
  let n = 0;
  while (existingNames.has(name)) {
    name = `${base}${++n}`;
  }
  const subjUri = BASE_IRI + name;
  const subject = DataFactory.namedNode(subjUri);
  const graph = store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
  const rangeNode = DataFactory.namedNode(rangeUri);
  store.addQuad(subject, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'DatatypeProperty'), graph);
  store.addQuad(subject, DataFactory.namedNode(RDFS + 'label'), DataFactory.literal(label || name), graph);
  store.addQuad(subject, DataFactory.namedNode(RDFS + 'domain'), DataFactory.namedNode(OWL + 'Thing'), graph);
  store.addQuad(subject, DataFactory.namedNode(RDFS + 'range'), rangeNode, graph);
  return name;
}

/**
 * Add a new annotation property (owl:AnnotationProperty) to the store.
 * Returns the property localName, or null on failure.
 */
export function addAnnotationPropertyToStore(
  store: Store,
  label: string,
  isBoolean: boolean,
  localName?: string
): string | null {
  const existingNames = new Set(getAnnotationProperties(store).map((ap) => ap.name));
  let name = localName ?? (extractLocalName(label) || 'newAnnotationProperty').replace(/\s+/g, '');
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) name = 'newAnnotationProperty';
  let base = name;
  let n = 0;
  while (existingNames.has(name)) {
    name = `${base}${++n}`;
  }
  const subjUri = BASE_IRI + name;
  const subject = DataFactory.namedNode(subjUri);
  const graph = store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
  store.addQuad(subject, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'AnnotationProperty'), graph);
  store.addQuad(subject, DataFactory.namedNode(RDFS + 'label'), DataFactory.literal(label || name), graph);
  if (isBoolean) {
    store.addQuad(subject, DataFactory.namedNode(RDFS + 'range'), DataFactory.namedNode(XSD_BOOLEAN), graph);
  }
  return name;
}

/**
 * Update rdfs:label for an annotation property in the store.
 */
export function updateAnnotationPropertyLabelInStore(
  store: Store,
  propertyName: string,
  newLabel: string
): boolean {
  const propUri = BASE_IRI + propertyName;
  const subject = DataFactory.namedNode(propUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;
  const labelPred = DataFactory.namedNode(RDFS + 'label');
  const labelQuads = store.getQuads(subject, labelPred, null, null);
  const graph = labelQuads[0]?.graph ?? quads[0]?.graph ?? DataFactory.defaultGraph();
  for (const lq of labelQuads) store.removeQuad(lq);
  store.addQuad(subject, labelPred, DataFactory.literal(newLabel.trim()), graph);
  return true;
}

/**
 * Update rdfs:comment for an annotation property in the store.
 */
export function updateAnnotationPropertyCommentInStore(
  store: Store,
  propertyName: string,
  comment: string | null
): boolean {
  const propUri = BASE_IRI + propertyName;
  const subject = DataFactory.namedNode(propUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;
  const commentPred = DataFactory.namedNode(RDFS + 'comment');
  const commentQuads = store.getQuads(subject, commentPred, null, null);
  const graph = commentQuads[0]?.graph ?? quads[0]?.graph ?? DataFactory.defaultGraph();
  for (const cq of commentQuads) store.removeQuad(cq);
  if (comment !== null && comment.trim() !== '') {
    store.addQuad(subject, commentPred, DataFactory.literal(comment.trim()), graph);
  }
  return true;
}

/**
 * Update whether an annotation property is boolean (rdfs:range xsd:boolean).
 */
export function updateAnnotationPropertyIsBooleanInStore(
  store: Store,
  propertyName: string,
  isBoolean: boolean
): boolean {
  const propUri = BASE_IRI + propertyName;
  const subject = DataFactory.namedNode(propUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;
  const rangePred = DataFactory.namedNode(RDFS + 'range');
  const rangeQuads = store.getQuads(subject, rangePred, null, null);
  const graph = rangeQuads[0]?.graph ?? quads[0]?.graph ?? DataFactory.defaultGraph();
  
  // Remove existing range quads
  for (const rq of rangeQuads) store.removeQuad(rq);
  
  // Add boolean range if needed
  if (isBoolean) {
    store.addQuad(subject, rangePred, DataFactory.namedNode(XSD_BOOLEAN), graph);
  }
  return true;
}

/**
 * Remove an annotation property from the store.
 */
export function removeAnnotationPropertyFromStore(store: Store, propertyName: string): boolean {
  const propUri = BASE_IRI + propertyName;
  const subject = DataFactory.namedNode(propUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;
  for (const q of quads) store.removeQuad(q);
  return true;
}

/**
 * Update rdfs:label for a data property in the store.
 */
export function updateDataPropertyLabelInStore(
  store: Store,
  propertyName: string,
  newLabel: string
): boolean {
  const propUri = BASE_IRI + propertyName;
  const subject = DataFactory.namedNode(propUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;
  const labelPred = DataFactory.namedNode(RDFS + 'label');
  const labelQuads = store.getQuads(subject, labelPred, null, null);
  const graph = labelQuads[0]?.graph ?? quads[0]?.graph ?? DataFactory.defaultGraph();
  for (const lq of labelQuads) store.removeQuad(lq);
  store.addQuad(subject, labelPred, DataFactory.literal(newLabel.trim()), graph);
  return true;
}

/**
 * Update rdfs:comment for a data property in the store.
 */
export function updateDataPropertyCommentInStore(
  store: Store,
  propertyName: string,
  comment: string | null
): boolean {
  const propUri = BASE_IRI + propertyName;
  const subject = DataFactory.namedNode(propUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;
  const commentPred = DataFactory.namedNode(RDFS + 'comment');
  const commentQuads = store.getQuads(subject, commentPred, null, null);
  const graph = commentQuads[0]?.graph ?? quads[0]?.graph ?? DataFactory.defaultGraph();
  for (const cq of commentQuads) store.removeQuad(cq);
  if (comment !== null && comment.trim() !== '') {
    store.addQuad(subject, commentPred, DataFactory.literal(comment.trim()), graph);
  }
  return true;
}

/**
 * Update rdfs:range for a data property in the store (datatype URI).
 */
export function updateDataPropertyRangeInStore(
  store: Store,
  propertyName: string,
  rangeUri: string
): boolean {
  const propUri = BASE_IRI + propertyName;
  const subject = DataFactory.namedNode(propUri);
  const rangePred = DataFactory.namedNode(RDFS + 'range');
  const rangeQuads = store.getQuads(subject, rangePred, null, null);
  if (rangeQuads.length === 0) return false;
  const graph = rangeQuads[0]?.graph ?? DataFactory.defaultGraph();
  for (const rq of rangeQuads) store.removeQuad(rq);
  store.addQuad(subject, rangePred, DataFactory.namedNode(rangeUri), graph);
  return true;
}

/**
 * Update data property domains in the store.
 * If domains array is empty, sets domain to owl:Thing (all classes).
 * Otherwise, removes all existing domain quads and adds new ones for each domain.
 */
export function updateDataPropertyDomainsInStore(
  store: Store,
  propertyName: string,
  domains: string[]
): boolean {
  // Find the property URI (could be from base IRI or external)
  let propUri: string | null = null;
  const dpQuads = store.getQuads(null, RDF + 'type', OWL + 'DatatypeProperty', null);
  for (const q of dpQuads) {
    if (q.subject.termType === 'NamedNode') {
      const currentUri = (q.subject as { value: string }).value;
      if (extractLocalName(currentUri) === propertyName) {
        propUri = currentUri;
        break;
      }
    }
  }
  
  if (!propUri) {
    console.warn(`Data property URI for "${propertyName}" not found in store.`);
    return false;
  }
  
  const subject = DataFactory.namedNode(propUri);
  const domainPred = DataFactory.namedNode(RDFS + 'domain');
  const existingDomainQuads = store.getQuads(subject, domainPred, null, null);
  const graph = existingDomainQuads[0]?.graph ?? DataFactory.defaultGraph();
  
  // Remove all existing domain quads
  for (const dq of existingDomainQuads) {
    store.removeQuad(dq);
  }
  
  // If domains array is empty, add owl:Thing (default - all classes)
  if (domains.length === 0) {
    store.addQuad(subject, domainPred, DataFactory.namedNode(OWL + 'Thing'), graph);
  } else {
    // Add each domain
    for (const domainName of domains) {
      // Try to find the domain URI (could be base IRI or external)
      let domainUri: string | null = null;
      const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
      for (const cq of classQuads) {
        if (cq.subject.termType === 'NamedNode') {
          const currentUri = (cq.subject as { value: string }).value;
          if (extractLocalName(currentUri) === domainName) {
            domainUri = currentUri;
            break;
          }
        }
      }
      
      // If not found, assume it's from base IRI
      if (!domainUri) {
        domainUri = BASE_IRI + domainName;
      }
      
      store.addQuad(subject, domainPred, DataFactory.namedNode(domainUri), graph);
    }
  }
  
  return true;
}

/**
 * Remove a data property from the store.
 */
export function removeDataPropertyFromStore(store: Store, propertyName: string): boolean {
  // First try the base IRI
  let propUri = BASE_IRI + propertyName;
  let subject = DataFactory.namedNode(propUri);
  let quads = store.getQuads(subject, null, null, null);
  
  // If not found, search for any DatatypeProperty with this local name
  if (quads.length === 0) {
    const dpQuads = store.getQuads(null, RDF + 'type', OWL + 'DatatypeProperty', null);
    for (const q of dpQuads) {
      if (q.subject.termType === 'NamedNode') {
        const subjUri = (q.subject as { value: string }).value;
        if (extractLocalName(subjUri) === propertyName) {
          propUri = subjUri;
          subject = DataFactory.namedNode(propUri);
          quads = store.getQuads(subject, null, null, null);
          break;
        }
      }
    }
  }
  
  if (quads.length === 0) return false;
  for (const q of quads) store.removeQuad(q);
  return true;
}

const OWL_ON_DATA_RANGE = OWL + 'onDataRange';

/** Resolve class URI from store by local name (use actual subject from loaded ontology). */
function getClassUriFromStore(store: Store, classLocalName: string): string {
  const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
  for (const q of classQuads) {
    if (q.subject.termType !== 'NamedNode') continue;
    const uri = (q.subject as { value: string }).value;
    if (extractLocalName(uri) === classLocalName) return uri;
  }
  return toClassUri(classLocalName);
}

function findDataRestrictionBlank(
  store: Store,
  classLocalName: string,
  dataPropName: string
): import('n3').BlankNode | null {
  const classUri = getClassUriFromStore(store, classLocalName);
  const dataPropQuads = store.getQuads(null, RDF + 'type', OWL + 'DatatypeProperty', null);
  let propUri = BASE_IRI + dataPropName;
  for (const q of dataPropQuads) {
    if (q.subject.termType === 'NamedNode' && extractLocalName((q.subject as { value: string }).value) === dataPropName) {
      propUri = (q.subject as { value: string }).value;
      break;
    }
  }
  const subClassQuads = store.getQuads(
    DataFactory.namedNode(classUri),
    DataFactory.namedNode(RDFS + 'subClassOf'),
    null,
    null
  );
  for (const q of subClassQuads) {
    const obj = q.object;
    if (obj.termType !== 'BlankNode') continue;
    const onProp = store.getQuads(obj, DataFactory.namedNode(OWL + 'onProperty'), null, null)[0];
    const onDataRange = store.getQuads(obj, DataFactory.namedNode(OWL_ON_DATA_RANGE), null, null)[0];
    if (!onProp || !onDataRange) continue;
    if ((onProp.object as { value: string }).value !== propUri) continue;
    return obj as import('n3').BlankNode;
  }
  return null;
}

/**
 * Add a data property restriction to a class (owl:Restriction with owl:onDataRange).
 * Uses the data property's declared range. Returns true on success.
 */
export function addDataPropertyRestrictionToClass(
  store: Store,
  classLocalName: string,
  dataPropName: string,
  cardinality?: { minCardinality?: number | null; maxCardinality?: number | null }
): boolean {
  if (findDataRestrictionBlank(store, classLocalName, dataPropName)) return false;
  const dataProps = getDataProperties(store);
  const dp = dataProps.find((p) => p.name === dataPropName);
  const rangeUri = dp?.range ?? XSD_NS + 'string';
  const graph = store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
  const classUri = getClassUriFromStore(store, classLocalName);
  const dataPropQuads = store.getQuads(null, RDF + 'type', OWL + 'DatatypeProperty', null);
  let propUri = BASE_IRI + dataPropName;
  for (const q of dataPropQuads) {
    if (q.subject.termType === 'NamedNode' && extractLocalName((q.subject as { value: string }).value) === dataPropName) {
      propUri = (q.subject as { value: string }).value;
      break;
    }
  }
  const blank = new BlankNode();
  const min = cardinality?.minCardinality;
  const max = cardinality?.maxCardinality;
  store.addQuad(DataFactory.namedNode(classUri), DataFactory.namedNode(RDFS + 'subClassOf'), blank, graph);
  store.addQuad(blank, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Restriction'), graph);
  store.addQuad(blank, DataFactory.namedNode(OWL + 'onProperty'), DataFactory.namedNode(propUri), graph);
  store.addQuad(blank, DataFactory.namedNode(OWL_ON_DATA_RANGE), DataFactory.namedNode(rangeUri), graph);
  if (min != null && max != null && min === max) {
    store.addQuad(blank, DataFactory.namedNode(OWL + 'cardinality'), DataFactory.literal(min, DataFactory.namedNode(XSD_NS + 'nonNegativeInteger')), graph);
  } else {
    if (min != null) store.addQuad(blank, DataFactory.namedNode(OWL + 'minCardinality'), DataFactory.literal(min, DataFactory.namedNode(XSD_NS + 'nonNegativeInteger')), graph);
    if (max != null) store.addQuad(blank, DataFactory.namedNode(OWL + 'maxCardinality'), DataFactory.literal(max, DataFactory.namedNode(XSD_NS + 'nonNegativeInteger')), graph);
  }
  return true;
}

/**
 * Remove a data property restriction from a class.
 */
export function removeDataPropertyRestrictionFromClass(
  store: Store,
  classLocalName: string,
  dataPropName: string
): boolean {
  const blank = findDataRestrictionBlank(store, classLocalName, dataPropName);
  if (!blank) return false;
  const classUri = getClassUriFromStore(store, classLocalName);
  const subClassOfPred = DataFactory.namedNode(RDFS + 'subClassOf');
  for (const q of store.getQuads(DataFactory.namedNode(classUri), subClassOfPred, blank, null)) store.removeQuad(q);
  for (const q of store.getQuads(blank, null, null, null)) store.removeQuad(q);
  for (const q of store.getQuads(null, null, blank, null)) store.removeQuad(q);
  return true;
}

/**
 * Read data property restrictions for a class from the store (same structure as parsed).
 */
export function getDataPropertyRestrictionsForClass(
  store: Store,
  classLocalName: string
): DataPropertyRestriction[] {
  const classUri = getClassUriFromStore(store, classLocalName);
  const result: DataPropertyRestriction[] = [];
  const subClassQuads = store.getQuads(DataFactory.namedNode(classUri), DataFactory.namedNode(RDFS + 'subClassOf'), null, null);
  for (const q of subClassQuads) {
    const obj = q.object;
    if (obj.termType !== 'BlankNode') continue;
    const onProp = store.getQuads(obj, DataFactory.namedNode(OWL + 'onProperty'), null, null)[0];
    const onDataRange = store.getQuads(obj, DataFactory.namedNode(OWL_ON_DATA_RANGE), null, null)[0];
    if (!onProp || !onDataRange) continue;
    const propName = extractLocalName((onProp.object as { value: string }).value);
    const minQ = store.getQuads(obj, OWL + 'minCardinality', null, null)[0];
    const maxQ = store.getQuads(obj, OWL + 'maxCardinality', null, null)[0];
    const cardQ = store.getQuads(obj, OWL + 'cardinality', null, null)[0];
    const toInt = (quad: import('n3').Quad | undefined): number | null =>
      quad?.object?.value != null ? parseInt(String(quad.object.value), 10) : null;
    let minCard: number | null = toInt(minQ);
    let maxCard: number | null = toInt(maxQ);
    const n = toInt(cardQ);
    if (n !== null && !isNaN(n)) {
      minCard = n;
      maxCard = n;
    }
    result.push({
      propertyName: propName,
      minCardinality: minCard ?? undefined,
      maxCardinality: maxCard ?? undefined,
    });
  }
  return result;
}

/**
 * Add an edge to the store. Supports subClassOf (direct quad) and partOf/contains (OWL restrictions).
 * Cardinality is optional; when provided, uses qualified cardinality (owl:onClass + min/maxQualifiedCardinality).
 */
export function addEdgeToStore(
  store: Store,
  from: string,
  to: string,
  edgeType: string,
  cardinality?: { minCardinality?: number | null; maxCardinality?: number | null }
): boolean {
  if (edgeType === 'subClassOf') {
    const subjUri = toClassUri(from);
    const objUri = toClassUri(to);
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
  // Any edge type other than subClassOf is stored as an OWL restriction
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
    const rdfType = DataFactory.namedNode(RDF + 'type');

    store.addQuad(fromUri, subClassOfPred, blank, graph);
    store.addQuad(blank, rdfType, restrictionType, graph);
    store.addQuad(blank, onPropertyPred, propUri, graph);

    const min = cardinality?.minCardinality;
    const max = cardinality?.maxCardinality;
    const hasCardinality = min != null || max != null;

    if (hasCardinality) {
      store.addQuad(blank, DataFactory.namedNode(OWL + 'onClass'), toUri, graph);
      if (min != null && max != null && min === max) {
        store.addQuad(blank, DataFactory.namedNode(OWL + 'qualifiedCardinality'), DataFactory.literal(min, DataFactory.namedNode(XSD + 'nonNegativeInteger')), graph);
      } else {
        if (min != null) {
          store.addQuad(blank, DataFactory.namedNode(OWL + 'minQualifiedCardinality'), DataFactory.literal(min, DataFactory.namedNode(XSD + 'nonNegativeInteger')), graph);
        }
        if (max != null) {
          store.addQuad(blank, DataFactory.namedNode(OWL + 'maxQualifiedCardinality'), DataFactory.literal(max, DataFactory.namedNode(XSD + 'nonNegativeInteger')), graph);
        }
      }
    } else {
      store.addQuad(blank, DataFactory.namedNode(OWL + 'someValuesFrom'), toUri, graph);
    }
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
    const subjUri = toClassUri(from);
    const objUri = toClassUri(to);
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

/**
 * Remove an object property from the store and all edges that use it.
 * Returns the number of edges removed, or -1 on failure.
 * Does not remove subClassOf (it is not an object property).
 */
export function removeObjectPropertyFromStore(store: Store, propertyName: string): number {
  if (propertyName === 'subClassOf') return -1;
  const propUri = getPropertyUri(propertyName);
  const propNode = DataFactory.namedNode(propUri);
  const onPropertyPred = DataFactory.namedNode(OWL + 'onProperty');
  const subClassOfPred = DataFactory.namedNode(RDFS + 'subClassOf');
  let removed = 0;
  const blanksToRemove: import('n3').BlankNode[] = [];
  for (const q of store.getQuads(null, onPropertyPred, propNode, null)) {
    if (q.subject.termType === 'BlankNode') blanksToRemove.push(q.subject as import('n3').BlankNode);
  }
  for (const blank of blanksToRemove) {
    const fromQuads = store.getQuads(null, subClassOfPred, blank, null);
    for (const fq of fromQuads) {
      store.removeQuad(fq);
      removed++;
    }
    for (const bq of store.getQuads(blank, null, null, null)) store.removeQuad(bq);
    for (const oq of store.getQuads(null, null, blank, null)) store.removeQuad(oq);
  }
  const subject = DataFactory.namedNode(propUri);
  for (const q of store.getQuads(subject, null, null, null)) store.removeQuad(q);
  return removed;
}

/**
 * Serialize the store to Turtle string with section dividers and spacing.
 */
export function storeToTurtle(store: Store, externalRefs?: Array<{ url: string; usePrefix: boolean; prefix?: string }>): Promise<string> {
  return new Promise((resolve, reject) => {
    const prefixes = { ...TURTLE_PREFIXES };
    
    // Add prefixes for external ontologies that use prefix
    if (externalRefs) {
      for (const ref of externalRefs) {
        if (ref.usePrefix && ref.prefix) {
          prefixes[ref.prefix] = ref.url;
        }
      }
    }
    
    const writer = new Writer({
      prefixes,
    });
    for (const q of store) {
      writer.addQuad(q);
    }
    writer.end((err: Error | null, result: string) => {
      if (err) reject(err);
      else resolve(postProcessTurtle(result, externalRefs));
    });
  });
}
