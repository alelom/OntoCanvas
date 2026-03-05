import { DataFactory, Parser, Store, Writer, BlankNode } from 'n3';
import { postProcessTurtle } from './turtlePostProcess';
import { getExampleImageUrisForClass } from './lib/exampleImageStore';
import { labelToCamelCaseIdentifier } from './lib/identifierFromLabel';
import type { GraphData, GraphEdge, GraphNode, AnnotationPropertyInfo, ObjectPropertyInfo, DataPropertyInfo, DataPropertyRestriction } from './types';
import { isDebugMode, debugLog, debugError } from './utils/debug';

const XSD = 'http://www.w3.org/2001/XMLSchema#';
const XSD_BOOLEAN = XSD + 'boolean';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';
export const BASE_IRI = 'http://example.org/aec-drawing-ontology#';
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

/** Return the main ontology IRI with trailing # for prefix matching, or null if not found. */
export function getMainOntologyBase(store: Store): string | null {
  const ontQuads = store.getQuads(null, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Ontology'), null);
  if (ontQuads.length === 0 || ontQuads[0].subject.termType !== 'NamedNode') return null;
  const uri = (ontQuads[0].subject as { value: string }).value;
  return uri.endsWith('#') ? uri : uri + '#';
}

/**
 * Return the namespace (base IRI with trailing #) used for class URIs in this store.
 * Used for exampleImage so the predicate lives in the same namespace as classes (e.g. :exampleImage not :Ontology#exampleImage).
 */
export function getClassNamespace(store: Store): string | null {
  const classQuads = store.getQuads(null, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Class'), null);
  for (const q of classQuads) {
    if (q.subject.termType !== 'NamedNode') continue;
    const uri = (q.subject as { value: string }).value;
    const localName = extractLocalName(uri);
    if (!localName) continue;
    if (uri.includes('#')) return uri.slice(0, uri.lastIndexOf('#') + 1);
    if (uri.includes('/')) return uri.slice(0, uri.lastIndexOf('/') + 1);
    return null;
  }
  return null;
}

export function getObjectProperties(store: Store): ObjectPropertyInfo[] {
  const result: ObjectPropertyInfo[] = [];
  const seen = new Set<string>();
  const mainBase = getMainOntologyBase(store);
  const classNs = getClassNamespace(store);
  const opQuads = store.getQuads(null, RDF + 'type', OWL + 'ObjectProperty', null);
  for (const q of opQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    const subjUri = (subj as { value: string }).value;
    const localName = extractLocalName(subjUri);
    const isFromMainOntology =
      (mainBase != null && (subjUri === mainBase || subjUri.startsWith(mainBase) || subjUri === mainBase.slice(0, -1))) ||
      (classNs != null && subjUri.startsWith(classNs)) ||
      (mainBase == null && classNs == null && subjUri.startsWith(BASE_IRI));
    // External (imported) properties always use full URI so we can show e.g. geo:hasGeometry in the UI.
    // Local (main ontology) properties use local name unless duplicate, then full URI so both appear in the list.
    const name = isFromMainOntology
      ? (seen.has(localName) ? subjUri : localName)
      : subjUri;
    if (seen.has(name)) continue;
    seen.add(localName);
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
    const OWL_THING = OWL + 'Thing';
    const domainQuads = store.getQuads(subj, DataFactory.namedNode(RDFS + 'domain'), null, null);
    const rangeQuads = store.getQuads(subj, DataFactory.namedNode(RDFS + 'range'), null, null);
    let domain: string | null = null;
    let range: string | null = null;
    if (domainQuads.length > 0 && domainQuads[0].object.termType === 'NamedNode') {
      const domainUri = (domainQuads[0].object as { value: string }).value;
      if (domainUri !== OWL_THING) domain = extractLocalName(domainUri);
    }
    if (rangeQuads.length > 0 && rangeQuads[0].object.termType === 'NamedNode') {
      const rangeUri = (rangeQuads[0].object as { value: string }).value;
      if (rangeUri !== OWL_THING) range = extractLocalName(rangeUri);
    }
    const isDefinedByQuad = store.getQuads(subj, DataFactory.namedNode(RDFS + 'isDefinedBy'), null, null)[0];
    const subPropertyOfQuad = store.getQuads(subj, DataFactory.namedNode(RDFS + 'subPropertyOf'), null, null)[0];
    let isDefinedBy: string | null = null;
    let subPropertyOf: string | null = null;
    if (isDefinedByQuad?.object?.termType === 'NamedNode') isDefinedBy = (isDefinedByQuad.object as { value: string }).value;
    if (subPropertyOfQuad?.object?.termType === 'NamedNode') subPropertyOf = (subPropertyOfQuad.object as { value: string }).value;
    result.push({
      name,
      label: String(label),
      hasCardinality,
      comment: comment || undefined,
      domain: domain ?? undefined,
      range: range ?? undefined,
      uri: subjUri,
      isDefinedBy: isDefinedBy ?? undefined,
      subPropertyOf: subPropertyOf ?? undefined
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function getAnnotationProperties(store: Store): AnnotationPropertyInfo[] {
  const result: AnnotationPropertyInfo[] = [];
  const seen = new Set<string>();
  // Map of subject URIs to their range values
  const rangeMap = new Map<string, string>();
  const RDFS_RANGE = RDFS + 'range';
  for (const q of store) {
    const predVal = (q.predicate as { value?: string; id?: string }).value ?? (q.predicate as { value?: string; id?: string }).id;
    if (predVal !== RDFS_RANGE) continue;
    const obj = q.object as { value?: string; id?: string };
    const rangeVal = obj?.value ?? obj?.id;
    if (typeof rangeVal === 'string') {
      const subjUri = (q.subject as { value: string }).value ?? (q.subject as { id: string }).id;
      if (subjUri) {
        rangeMap.set(subjUri, rangeVal);
      }
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
    const range = rangeMap.get(subjUri) ?? null;
    const isBoolean = range === XSD_BOOLEAN || range?.endsWith('#boolean') || false;
    result.push({ name, isBoolean, range });
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

    const exampleImages = getExampleImageUrisForClass(store, localName, getClassNamespace(store) ?? getMainOntologyBase(store) ?? BASE_IRI);

    nodes.push({
      id: localName,
      label,
      labellableRoot,
      comment: comment || undefined,
      annotations,
      dataPropertyRestrictions: [],
      exampleImages: exampleImages.length > 0 ? exampleImages : undefined,
    });
  }

  // subClassOf edges
  const subClassQuads = store.getQuads(null, RDFS + 'subClassOf', null, null);
  const seenPairs = new Set<string>();

  // Debug: Log all blank node restrictions to find describes edge
  const blankNodeRestrictions = subClassQuads.filter((q) => isBlankNode(q.object));
  console.log(`[DEBUG] Found ${blankNodeRestrictions.length} blank node restrictions (potential edges)`);
  
  // Debug: Specifically look for describes property
  const describesPropertyUri = 'https://w3id.org/dano#describes';
  let foundDescribesRestriction = false;

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

      // Debug: Check if this is the describes restriction
      if (onProperty) {
        const propUri = (onProperty.object as { value: string }).value;
        if (propUri === describesPropertyUri || propUri.includes('describes')) {
          foundDescribesRestriction = true;
          console.log('[DEBUG] Found describes restriction:', {
            subject: subjUri,
            subjectName: subjName,
            propertyUri: propUri,
            someValuesFrom: someValuesFrom ? (someValuesFrom.object as { value: string }).value : null,
            onClass: onClass ? (onClass.object as { value: string }).value : null,
            subjectInSeenClasses: seenClasses.has(subjName),
          });
        }
      }

      const targetQuad = someValuesFrom ?? onClass;
      if (!onProperty || !targetQuad) {
        // Debug: Log why restriction was skipped
        if (!onProperty) {
          console.log(`[DEBUG] Skipped restriction: missing onProperty for subject ${subjName}`);
        }
        if (!targetQuad) {
          console.log(`[DEBUG] Skipped restriction: missing someValuesFrom/onClass for subject ${subjName}, property ${onProperty ? (onProperty.object as { value: string }).value : 'unknown'}`);
        }
        continue;
      }
      const target = targetQuad.object;
      if (target.termType !== 'NamedNode') {
        console.log(`[DEBUG] Skipped restriction: target is not NamedNode for subject ${subjName}`);
        continue;
      }
      const targetName = extractLocalName(target.value);
      
      // Debug: Log node matching for describes
      if (onProperty && ((onProperty.object as { value: string }).value === describesPropertyUri || (onProperty.object as { value: string }).value.includes('describes'))) {
        console.log('[DEBUG] Processing describes restriction:', {
          subjectName: subjName,
          targetUri: target.value,
          targetName: targetName,
          targetInSeenClasses: seenClasses.has(targetName),
          seenClassesList: Array.from(seenClasses).filter((n) => n.includes('Description') || n.includes('Display')),
        });
      }
      
      if (!seenClasses.has(targetName)) {
        // Debug: Log when target node is missing
        if (onProperty && ((onProperty.object as { value: string }).value === describesPropertyUri || (onProperty.object as { value: string }).value.includes('describes'))) {
          console.warn(`[DEBUG] Target node "${targetName}" not in seenClasses. Available classes:`, Array.from(seenClasses));
        }
        continue;
      }
      
      // Preserve full URI for external properties, use local name for local properties
      const propUri = (onProperty.object as { value: string }).value;
      const isExternalProperty = !propUri.startsWith(BASE_IRI);
      const propName = isExternalProperty ? propUri : extractLocalName(propUri);

      const cardinality = parseCardinalityFromRestriction(
        minQual, maxQual, qualCard, minCard, maxCard, someValuesFrom, propName
      );

      const key = `${subjName}->${targetName}:${propName}`;
      if (!seenPairs.has(key)) {
        seenPairs.add(key);
        const edge: GraphEdge = { 
          from: subjName, 
          to: targetName, 
          type: propName, 
          ...cardinality,
          isRestriction: true, // Mark as restriction (from OWL restriction)
        };
        
        // Debug: Log DimensionChain contains edge specifically
        if (subjName === 'DimensionChain' && targetName === 'Dimension' && propName.includes('contains')) {
          console.log('[DEBUG] Parsed DimensionChain->Dimension contains restriction:', {
            edge,
            cardinality,
            minQual: minQual ? (minQual.object as { value: string }).value : null,
            maxQual: maxQual ? (maxQual.object as { value: string }).value : null,
            qualCard: qualCard ? (qualCard.object as { value: string }).value : null,
            minCard: minCard ? (minCard.object as { value: string }).value : null,
            maxCard: maxCard ? (maxCard.object as { value: string }).value : null,
            someValuesFrom: someValuesFrom ? (someValuesFrom.object as { value: string }).value : null,
          });
        }
        
        edges.push(edge);
        // Debug: Log external property edges
        if (propName.startsWith('http://') || propName.startsWith('https://')) {
          console.log('[DEBUG] Parsed external property edge:', edge);
        }
        // Debug: Specifically log describes edge
        if (propName === describesPropertyUri || propName.includes('describes')) {
          console.log('[DEBUG] ✓ Successfully added describes edge:', edge);
        }
        // Debug: Log contains edges to check for duplicates
        if (propName.includes('contains')) {
          console.log('[DEBUG] Added contains edge:', { key, edge, propName, propUri });
        }
      } else {
        // Debug: Log duplicate edge
        if (propName === describesPropertyUri || propName.includes('describes')) {
          console.log('[DEBUG] Duplicate describes edge skipped (key already exists):', key);
        }
        // Debug: Log duplicate contains edge
        if (propName.includes('contains')) {
          console.warn('[DEBUG] ⚠ Duplicate contains edge skipped (key already exists):', key, {
            subject: subjUri,
            target: target.value,
            propUri: propUri
          });
        }
      }
    }
  }
  
  // Debug: Summary
  if (!foundDescribesRestriction) {
    console.warn('[DEBUG] ⚠ No describes restriction found in TTL store');
  }
  console.log(`[DEBUG] Total edges parsed: ${edges.length}`);
  const describesEdges = edges.filter((e) => e.type === describesPropertyUri || e.type.includes('describes'));
  console.log(`[DEBUG] Describes edges in parsed edges: ${describesEdges.length}`, describesEdges);

  const objectProps = getObjectProperties(store);
  const dataProps = getDataProperties(store);

  // Create edges from object property domain/range definitions
  // This handles cases where properties are defined but not used in restrictions
  // (e.g., dano:describes with domain DescriptionElement and range DisplayElement)
  // Note: We create domain/range edges for all properties, but they are marked as
  // isRestriction: false. When a restriction is removed, the edge from domain/range
  // will still exist, which is the expected behavior for most properties.
  // IMPORTANT: rawData.edges contains at most one edge per from/to/type combination.
  // If both a restriction and domain/range exist for the same property, only one edge
  // is created (the restriction edge takes precedence).
  for (const op of objectProps) {
    // Use explicit URI when set (disambiguates e.g. hasGeometry from GeoSPARQL vs DAnO), else name if full URI, else resolve from store
    let propUri: string;
    if (op.uri) {
      propUri = op.uri;
    } else if (op.name.startsWith('http://') || op.name.startsWith('https://')) {
      propUri = op.name;
    } else {
      const opQuads = store.getQuads(null, RDF + 'type', OWL + 'ObjectProperty', null);
      propUri = BASE_IRI + op.name;
      for (const q of opQuads) {
        if (q.subject.termType === 'NamedNode') {
          const uri = (q.subject as { value: string }).value;
          if (extractLocalName(uri) === op.name) {
            propUri = uri;
            break;
          }
        }
      }
    }
    
    const propNode = DataFactory.namedNode(propUri);
    const domainQuads = store.getQuads(propNode, DataFactory.namedNode(RDFS + 'domain'), null, null);
    const rangeQuads = store.getQuads(propNode, DataFactory.namedNode(RDFS + 'range'), null, null);
    
    // For each domain-range pair, create an edge if both classes exist
    for (const domainQuad of domainQuads) {
      if (domainQuad.object.termType !== 'NamedNode') continue;
      const domainUri = (domainQuad.object as { value: string }).value;
      const domainName = extractLocalName(domainUri);
      if (!seenClasses.has(domainName)) continue;
      
      for (const rangeQuad of rangeQuads) {
        if (rangeQuad.object.termType !== 'NamedNode') continue;
        const rangeUri = (rangeQuad.object as { value: string }).value;
        const rangeName = extractLocalName(rangeUri);
        if (!seenClasses.has(rangeName)) continue;
        
        // Use full URI for external properties, local name for local properties
        const isExternalProperty = !propUri.startsWith(BASE_IRI);
        const propName = isExternalProperty ? propUri : op.name;
        
        // Only create edge if it doesn't already exist as a restriction
        const key = `${domainName}->${rangeName}:${propName}`;
        if (!seenPairs.has(key)) {
          seenPairs.add(key);
          const edge: GraphEdge = { 
            from: domainName, 
            to: rangeName, 
            type: propName,
            isRestriction: false, // Mark as non-restriction (from domain/range, not OWL restriction)
          };
          edges.push(edge);
          
          // Debug: Log domain/range edges
          if (propName.includes('describes') || propName.includes('contains')) {
            console.log('[DEBUG] Added edge from domain/range:', { edge, propUri, domainUri, rangeUri });
          }
        }
      }
    }
  }

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

export function getDataProperties(store: Store): DataPropertyInfo[] {
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
    const isDefinedByQuad = store.getQuads(subj, DataFactory.namedNode(RDFS + 'isDefinedBy'), null, null)[0];
    const isDefinedBy =
      isDefinedByQuad?.object?.termType === 'NamedNode'
        ? (isDefinedByQuad.object as { value: string }).value
        : null;
    result.push({
      name,
      label: String(label),
      comment: comment || undefined,
      range,
      domains,
      uri: subjUri,
      isDefinedBy: isDefinedBy ?? undefined
    });
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

/** Resolve object property name to full URI from store (so loaded ontologies use their base). */
function getObjectPropertyUriFromStore(store: Store, name: string): string {
  if (name.startsWith('http://') || name.startsWith('https://')) return name;
  const ops = getObjectProperties(store);
  const op = ops.find((p) => p.name === name || p.uri === name);
  if (!op || !op.uri) {
    // Fallback to BASE_IRI if property not found (for backward compatibility)
    // Note: This may fail if the property is from an imported ontology
    return BASE_IRI + name;
  }
  return op.uri;
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
 * Derive the identifier that would be used for a new node with the given label.
 * Used by the editor to validate before adding. Must stay in sync with addNodeToStore.
 */
export function deriveNewNodeIdentifier(label: string): string {
  const raw = labelToCamelCaseIdentifier(label) || extractLocalName(label) || 'NewClass';
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(raw) ? raw : 'NewClass';
}

/**
 * Add a new OWL class (node) to the store.
 * Returns the new localName, or null if a node with that identifier already exists.
 */
export function addNodeToStore(
  store: Store,
  label: string,
  localName?: string
): string | null {
  const existingIdsLower = new Set<string>();
  const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
  for (const q of classQuads) {
    const subj = q.subject;
    if (subj.termType === 'NamedNode') {
      existingIdsLower.add(extractLocalName((subj as { value: string }).value).toLowerCase());
    }
  }
  const id = localName ?? deriveNewNodeIdentifier(label);
  if (existingIdsLower.has(id.toLowerCase())) return null;
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
 * Optional: comment, isDefinedBy (URI), subPropertyOf (name or URI), domain (class local name), range (class local name).
 */
export function addObjectPropertyToStore(
  store: Store,
  label: string,
  hasCardinality: boolean,
  localName?: string,
  options?: { comment?: string | null; isDefinedBy?: string | null; subPropertyOf?: string | null; domain?: string | null; range?: string | null }
): string | null {
  const existingNames = new Set(getObjectProperties(store).map((op) => op.name));
  let name = localName ?? (labelToCamelCaseIdentifier(label) || extractLocalName(label) || 'newProperty').replace(/\s+/g, '');
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) name = 'newProperty';
  const baseName = name;
  let n = 0;
  while (existingNames.has(name)) {
    name = `${baseName}${++n}`;
  }
  ensureHasCardinalityAnnotationProperty(store);
  const ns = getClassNamespace(store) ?? getMainOntologyBase(store) ?? BASE_IRI;
  const base = ns.endsWith('#') ? ns : ns + '#';
  const subjUri = base + name;
  const subject = DataFactory.namedNode(subjUri);
  const graph = store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
  const OWL_THING_URI = OWL + 'Thing';
  const domainUri = (options?.domain?.trim() ?? '') ? resolveClassUri(store, options.domain!.trim()) : OWL_THING_URI;
  const rangeUri = (options?.range?.trim() ?? '') ? resolveClassUri(store, options.range!.trim()) : OWL_THING_URI;
  store.addQuad(subject, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'ObjectProperty'), graph);
  store.addQuad(subject, DataFactory.namedNode(RDFS + 'label'), DataFactory.literal(label || name), graph);
  store.addQuad(subject, DataFactory.namedNode(RDFS + 'domain'), DataFactory.namedNode(domainUri), graph);
  store.addQuad(subject, DataFactory.namedNode(RDFS + 'range'), DataFactory.namedNode(rangeUri), graph);
  store.addQuad(
    subject,
    DataFactory.namedNode(HAS_CARDINALITY_PROP),
    DataFactory.literal(String(hasCardinality), DataFactory.namedNode(XSD + 'boolean')),
    graph
  );
  if (options?.comment != null && options.comment.trim() !== '') {
    store.addQuad(subject, DataFactory.namedNode(RDFS + 'comment'), DataFactory.literal(options.comment.trim()), graph);
  }
  if (options?.isDefinedBy != null && options.isDefinedBy.trim() !== '' && options.isDefinedBy.trim().startsWith('http')) {
    store.addQuad(subject, DataFactory.namedNode(RDFS + 'isDefinedBy'), DataFactory.namedNode(options.isDefinedBy.trim()), graph);
  }
  if (options?.subPropertyOf != null && options.subPropertyOf.trim() !== '') {
    const parentUri = resolveObjectPropertyUri(store, options.subPropertyOf.trim());
    if (parentUri) store.addQuad(subject, DataFactory.namedNode(RDFS + 'subPropertyOf'), DataFactory.namedNode(parentUri), graph);
  }
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
  const propUri = getObjectPropertyUriFromStore(store, propertyName);
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
  const propUri = getObjectPropertyUriFromStore(store, propertyName);
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

const OWL_THING_URI = OWL + 'Thing';

/**
 * Resolve a class local name to full URI (from store or BASE_IRI).
 */
function resolveClassUri(store: Store, localName: string): string {
  if (!localName || localName.trim() === '') return OWL_THING_URI;
  const classQuads = store.getQuads(null, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Class'), null);
  for (const cq of classQuads) {
    if (cq.subject.termType === 'NamedNode') {
      const currentUri = (cq.subject as { value: string }).value;
      if (extractLocalName(currentUri) === localName.trim()) return currentUri;
    }
  }
  return BASE_IRI + localName.trim();
}

/**
 * Update rdfs:domain and rdfs:range for an object property in the store.
 * domainName/rangeName are class local names; null or empty means owl:Thing.
 * Returns false for subClassOf or if property not found.
 */
export function updateObjectPropertyDomainRangeInStore(
  store: Store,
  propertyName: string,
  domainName: string | null,
  rangeName: string | null
): boolean {
  if (propertyName === 'subClassOf') return false;
  const propUri = getObjectPropertyUriFromStore(store, propertyName);
  const subject = DataFactory.namedNode(propUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;

  const domainPred = DataFactory.namedNode(RDFS + 'domain');
  const rangePred = DataFactory.namedNode(RDFS + 'range');
  const domainQuads = store.getQuads(subject, domainPred, null, null);
  const rangeQuads = store.getQuads(subject, rangePred, null, null);
  const graph = domainQuads[0]?.graph ?? rangeQuads[0]?.graph ?? quads[0]?.graph ?? DataFactory.defaultGraph();

  for (const dq of domainQuads) store.removeQuad(dq);
  for (const rq of rangeQuads) store.removeQuad(rq);

  const domainUri = (domainName?.trim() ?? '') ? resolveClassUri(store, domainName!) : OWL_THING_URI;
  const rangeUri = (rangeName?.trim() ?? '') ? resolveClassUri(store, rangeName!) : OWL_THING_URI;
  store.addQuad(subject, domainPred, DataFactory.namedNode(domainUri), graph);
  store.addQuad(subject, rangePred, DataFactory.namedNode(rangeUri), graph);
  return true;
}

/**
 * Resolve object property name or URI to full URI (from store or BASE_IRI).
 */
function resolveObjectPropertyUri(store: Store, nameOrUri: string): string {
  if (!nameOrUri || !nameOrUri.trim()) return '';
  const trimmed = nameOrUri.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const ops = getObjectProperties(store);
  for (const op of ops) {
    if (op.uri === trimmed || op.name === trimmed) return op.uri ?? BASE_IRI + trimmed;
  }
  return BASE_IRI + trimmed;
}

/**
 * Update rdfs:subPropertyOf for an object property in the store.
 * parentNameOrUri: object property local name or full URI; null/empty removes the triple.
 * Returns false for subClassOf or if property not found.
 */
export function updateObjectPropertySubPropertyOfInStore(
  store: Store,
  propertyName: string,
  parentNameOrUri: string | null
): boolean {
  if (propertyName === 'subClassOf') return false;
  const propUri = getObjectPropertyUriFromStore(store, propertyName);
  const subject = DataFactory.namedNode(propUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;

  const pred = DataFactory.namedNode(RDFS + 'subPropertyOf');
  const existing = store.getQuads(subject, pred, null, null);
  const graph = existing[0]?.graph ?? quads[0]?.graph ?? DataFactory.defaultGraph();
  for (const q of existing) store.removeQuad(q);
  if (parentNameOrUri != null && parentNameOrUri.trim() !== '') {
    const parentUri = resolveObjectPropertyUri(store, parentNameOrUri);
    if (parentUri) store.addQuad(subject, pred, DataFactory.namedNode(parentUri), graph);
  }
  return true;
}

/**
 * Update rdfs:isDefinedBy for an object property in the store.
 * uri: full URI of the defining ontology; null/empty removes the triple.
 * Returns false for subClassOf or if property not found.
 */
export function updateObjectPropertyIsDefinedByInStore(
  store: Store,
  propertyName: string,
  uri: string | null
): boolean {
  if (propertyName === 'subClassOf') return false;
  const propUri = getObjectPropertyUriFromStore(store, propertyName);
  const subject = DataFactory.namedNode(propUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;

  const pred = DataFactory.namedNode(RDFS + 'isDefinedBy');
  const existing = store.getQuads(subject, pred, null, null);
  const graph = existing[0]?.graph ?? quads[0]?.graph ?? DataFactory.defaultGraph();
  for (const q of existing) store.removeQuad(q);
  if (uri != null && uri.trim() !== '' && uri.trim().startsWith('http')) {
    store.addQuad(subject, pred, DataFactory.namedNode(uri.trim()), graph);
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
  let name = localName ?? (labelToCamelCaseIdentifier(label) || extractLocalName(label) || 'newDataProperty').replace(/\s+/g, '');
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) name = 'newDataProperty';
  const baseName = name;
  let n = 0;
  while (existingNames.has(name)) {
    name = `${baseName}${++n}`;
  }
  const ns = getClassNamespace(store) ?? getMainOntologyBase(store) ?? BASE_IRI;
  const base = ns.endsWith('#') ? ns : ns + '#';
  const subjUri = base + name;
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
 * @param rangeUri Full URI of the datatype range (e.g. http://www.w3.org/2001/XMLSchema#boolean). null means no range.
 */
export function addAnnotationPropertyToStore(
  store: Store,
  label: string,
  rangeUri: string | null,
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
  if (rangeUri) {
    store.addQuad(subject, DataFactory.namedNode(RDFS + 'range'), DataFactory.namedNode(rangeUri), graph);
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
 * @deprecated Use updateAnnotationPropertyRangeInStore instead
 */
export function updateAnnotationPropertyIsBooleanInStore(
  store: Store,
  propertyName: string,
  isBoolean: boolean
): boolean {
  const rangeUri = isBoolean ? XSD_BOOLEAN : null;
  return updateAnnotationPropertyRangeInStore(store, propertyName, rangeUri);
}

/**
 * Update the range (rdfs:range) of an annotation property in the store.
 * @param rangeUri Full URI of the datatype (e.g. http://www.w3.org/2001/XMLSchema#boolean). null to remove range.
 */
export function updateAnnotationPropertyRangeInStore(
  store: Store,
  propertyName: string,
  rangeUri: string | null
): boolean {
  // Find the property URI (could be from base IRI or external)
  let propUri: string | null = null;
  const apQuads = store.getQuads(null, RDF + 'type', OWL + 'AnnotationProperty', null);
  for (const q of apQuads) {
    if (q.subject.termType === 'NamedNode') {
      const currentUri = (q.subject as { value: string }).value;
      if (extractLocalName(currentUri) === propertyName) {
        propUri = currentUri;
        break;
      }
    }
  }
  
  // If not found, assume it's from base IRI
  if (!propUri) {
    propUri = BASE_IRI + propertyName;
  }
  
  const subject = DataFactory.namedNode(propUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;
  const rangePred = DataFactory.namedNode(RDFS + 'range');
  const rangeQuads = store.getQuads(subject, rangePred, null, null);
  const graph = rangeQuads[0]?.graph ?? quads[0]?.graph ?? DataFactory.defaultGraph();
  
  // Remove existing range quads
  for (const rq of rangeQuads) store.removeQuad(rq);
  
  // Add new range if provided
  if (rangeUri) {
    store.addQuad(subject, rangePred, DataFactory.namedNode(rangeUri), graph);
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

/** Resolve data property name to full URI from store. */
function getDataPropertyUriFromStore(store: Store, name: string): string {
  if (name.startsWith('http://') || name.startsWith('https://')) return name;
  const dps = getDataProperties(store);
  const dp = dps.find((p) => p.name === name || p.uri === name);
  return dp?.uri ?? BASE_IRI + name;
}

/**
 * Update rdfs:label for a data property in the store.
 */
export function updateDataPropertyLabelInStore(
  store: Store,
  propertyName: string,
  newLabel: string
): boolean {
  const propUri = getDataPropertyUriFromStore(store, propertyName);
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
  const propUri = getDataPropertyUriFromStore(store, propertyName);
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
 * Update rdfs:isDefinedBy for a data property in the store.
 */
export function updateDataPropertyIsDefinedByInStore(
  store: Store,
  propertyName: string,
  uri: string | null
): boolean {
  const propUri = getDataPropertyUriFromStore(store, propertyName);
  const subject = DataFactory.namedNode(propUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;
  const pred = DataFactory.namedNode(RDFS + 'isDefinedBy');
  const existing = store.getQuads(subject, pred, null, null);
  const graph = existing[0]?.graph ?? quads[0]?.graph ?? DataFactory.defaultGraph();
  for (const q of existing) store.removeQuad(q);
  if (uri != null && uri.trim() !== '' && uri.trim().startsWith('http')) {
    store.addQuad(subject, pred, DataFactory.namedNode(uri.trim()), graph);
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
  const propUri = getDataPropertyUriFromStore(store, propertyName);
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
 * Remove only the OWL restriction from the store, leaving the domain/range definition intact.
 * The edge will remain visible as a non-restriction edge (from domain/range).
 * Called from the Edit Edge modal when unchecking "is restriction".
 * 
 * @throws Error if the restriction cannot be found or removed
 */
export function removeRestrictionFromStore(
  store: Store,
  from: string,
  to: string,
  edgeType: string
): void {
  if (edgeType === 'subClassOf') {
    // subClassOf is not a restriction, it's a direct relationship
    const subjUri = toClassUri(from);
    const objUri = toClassUri(to);
    const quads = store.getQuads(
      DataFactory.namedNode(subjUri),
      DataFactory.namedNode(RDFS + 'subClassOf'),
      DataFactory.namedNode(objUri),
      null
    );
    if (quads.length === 0) {
      throw new Error(`Cannot remove subClassOf edge: ${from} -> ${to} (not found in store)`);
    }
    for (const q of quads) store.removeQuad(q);
    return;
  }
  
  // Find and remove the restriction blank node
  const blank = findRestrictionBlank(store, from, edgeType, to);
  if (!blank) {
    throw new Error(`Cannot remove restriction: ${from} -> ${to} : ${edgeType} (restriction not found in store)`);
  }
  
  // Restriction exists - remove it
  const fromUri = DataFactory.namedNode(toClassUri(from));
  const subClassOfQuads = store.getQuads(fromUri, DataFactory.namedNode(RDFS + 'subClassOf'), blank, null);
  for (const q of subClassOfQuads) store.removeQuad(q);
  const blankQuads = store.getQuads(blank, null, null, null);
  for (const q of blankQuads) store.removeQuad(q);
  const blankAsObjQuads = store.getQuads(null, null, blank, null);
  for (const q of blankAsObjQuads) store.removeQuad(q);
}

/**
 * Remove an edge completely from the store. Removes both the restriction (if it exists) and
 * the domain/range definition. The edge will no longer appear in the graph.
 * 
 * Called when:
 * - User deletes a selected edge by pressing Del key
 * - Domain/range are deleted from the Edit Edge or Edit Object Property modals
 * 
 * Supports subClassOf (direct quads) and any restriction-backed edge type.
 * Note: rawData.edges contains at most one edge per from/to/type combination.
 * Note: edgeType should be a full URI (especially for imported ontologies to avoid name conflicts).
 * 
 * @throws Error if domain/range cannot be found or removed (e.g., nodes deleted, property not found)
 */
export function removeEdgeFromStore(
  store: Store,
  from: string,
  to: string,
  edgeType: string
): void {
  if (isDebugMode()) {
    debugLog(`[DELETE EDGE] removeEdgeFromStore called: ${from} -> ${to} : ${edgeType}`);
  }
  
  if (edgeType === 'subClassOf') {
    const subjUri = toClassUri(from);
    const objUri = toClassUri(to);
    const quads = store.getQuads(
      DataFactory.namedNode(subjUri),
      DataFactory.namedNode(RDFS + 'subClassOf'),
      DataFactory.namedNode(objUri),
      null
    );
    if (isDebugMode()) {
      debugLog(`[DELETE EDGE] subClassOf: found ${quads.length} quads`);
    }
    if (quads.length === 0) {
      throw new Error(`Cannot remove subClassOf edge: ${from} -> ${to} (not found in store)`);
    }
    for (const q of quads) store.removeQuad(q);
    if (isDebugMode()) {
      debugLog(`[DELETE EDGE] subClassOf: removed ${quads.length} quads successfully`);
    }
    return;
  }
  
  // Remove restriction if it exists
  const blank = findRestrictionBlank(store, from, edgeType, to);
  if (blank) {
    if (isDebugMode()) {
      debugLog(`[DELETE EDGE] Found restriction blank node: ${blank.value}`);
    }
    const fromUri = DataFactory.namedNode(toClassUri(from));
    const subClassOfQuads = store.getQuads(fromUri, DataFactory.namedNode(RDFS + 'subClassOf'), blank, null);
    if (isDebugMode()) {
      debugLog(`[DELETE EDGE] Removing ${subClassOfQuads.length} subClassOf quads pointing to restriction`);
    }
    for (const q of subClassOfQuads) store.removeQuad(q);
    const blankQuads = store.getQuads(blank, null, null, null);
    if (isDebugMode()) {
      debugLog(`[DELETE EDGE] Removing ${blankQuads.length} quads from restriction blank node`);
    }
    for (const q of blankQuads) store.removeQuad(q);
    const blankAsObjQuads = store.getQuads(null, null, blank, null);
    if (isDebugMode()) {
      debugLog(`[DELETE EDGE] Removing ${blankAsObjQuads.length} quads with restriction as object`);
    }
    for (const q of blankAsObjQuads) store.removeQuad(q);
  } else {
    if (isDebugMode()) {
      debugLog(`[DELETE EDGE] No restriction found for ${from} -> ${to} : ${edgeType}`);
    }
  }
  
  // Always remove domain/range definition to completely remove the edge
  // Domain/range quads are on the property, not the nodes, so we can remove them even if nodes don't exist
  const fromUri = toClassUri(from);
  const toUri = toClassUri(to);
  if (isDebugMode()) {
    debugLog(`[DELETE EDGE] Resolving property URI for edgeType: ${edgeType}`);
    debugLog(`[DELETE EDGE] From URI: ${fromUri}, To URI: ${toUri}`);
  }
  
  // Resolve property URI from store to handle different namespaces
  // Note: edgeType should ideally be a full URI (especially for imported ontologies to avoid name conflicts),
  // but we support local names for backward compatibility
  const propUri = getObjectPropertyUriFromStore(store, edgeType);
  if (isDebugMode()) {
    debugLog(`[DELETE EDGE] Resolved property URI: ${propUri}`);
  }
  if (!propUri) {
    throw new Error(`Cannot resolve property URI for edge type: ${edgeType}`);
  }
  
  const propNode = DataFactory.namedNode(propUri);
  const fromUriNode = DataFactory.namedNode(fromUri);
  const toUriNode = DataFactory.namedNode(toUri);
  
  // Remove the specific domain/range pair
  const domainQuads = store.getQuads(propNode, DataFactory.namedNode(RDFS + 'domain'), fromUriNode, null);
  const rangeQuads = store.getQuads(propNode, DataFactory.namedNode(RDFS + 'range'), toUriNode, null);
  if (isDebugMode()) {
    debugLog(`[DELETE EDGE] Found ${domainQuads.length} domain quads and ${rangeQuads.length} range quads`);
  }
  
  if (domainQuads.length === 0 && rangeQuads.length === 0) {
    if (isDebugMode()) {
      debugError(`[DELETE EDGE] ERROR: No domain/range quads found for ${from} -> ${to} : ${edgeType}`);
      debugError(`[DELETE EDGE] Property URI: ${propUri}, From URI: ${fromUri}, To URI: ${toUri}`);
      // Log all domain/range quads for this property to help debug
      const allDomainQuads = store.getQuads(propNode, DataFactory.namedNode(RDFS + 'domain'), null, null);
      const allRangeQuads = store.getQuads(propNode, DataFactory.namedNode(RDFS + 'range'), null, null);
      debugError(`[DELETE EDGE] All domain quads for property: ${allDomainQuads.length}`, allDomainQuads.map(q => ({ domain: q.object.value })));
      debugError(`[DELETE EDGE] All range quads for property: ${allRangeQuads.length}`, allRangeQuads.map(q => ({ range: q.object.value })));
    }
    throw new Error(`Cannot remove edge: domain/range definition not found for ${from} -> ${to} : ${edgeType}`);
  }
  
  // Remove domain if it matches
  for (const q of domainQuads) {
    store.removeQuad(q);
  }
  // Remove range if it matches
  for (const q of rangeQuads) {
    store.removeQuad(q);
  }
  if (isDebugMode()) {
    debugLog(`[DELETE EDGE] Successfully removed ${domainQuads.length} domain quads and ${rangeQuads.length} range quads`);
  }
}

/**
 * Rename an object property in the store (change its subject URI).
 * Updates all quads that have the old subject or old URI as object (e.g. rdfs:subPropertyOf).
 * @param oldSubjectUri Full URI of the property (e.g. from ObjectPropertyInfo.uri).
 * @param newLocalName New local name (identifier) for the property.
 * @returns true if rename succeeded.
 */
export function renameObjectPropertyInStore(
  store: Store,
  oldSubjectUri: string,
  newLocalName: string
): boolean {
  if (!newLocalName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newLocalName)) return false;
  const mainBase = getMainOntologyBase(store) ?? BASE_IRI;
  const base = mainBase.endsWith('#') ? mainBase : mainBase + '#';
  const newUri = base + newLocalName;
  if (oldSubjectUri === newUri) return true;
  const oldSubject = DataFactory.namedNode(oldSubjectUri);
  const newSubject = DataFactory.namedNode(newUri);
  const quadsWithOldSubject = store.getQuads(oldSubject, null, null, null);
  const quadsWithOldObject = store.getQuads(null, null, oldSubject, null);
  const graph = quadsWithOldSubject[0]?.graph ?? quadsWithOldObject[0]?.graph ?? DataFactory.defaultGraph();
  for (const q of quadsWithOldSubject) {
    store.addQuad(
      newSubject,
      q.predicate,
      q.object,
      q.graph.termType === 'DefaultGraph' ? graph : q.graph
    );
  }
  for (const q of quadsWithOldObject) {
    store.addQuad(
      q.subject,
      q.predicate,
      newSubject,
      q.graph.termType === 'DefaultGraph' ? graph : q.graph
    );
  }
  for (const q of quadsWithOldSubject) store.removeQuad(q);
  for (const q of quadsWithOldObject) store.removeQuad(q);
  return true;
}

/**
 * Rename a data property in the store (change its subject URI).
 * @param oldSubjectUri Full URI of the property (e.g. from DataPropertyInfo.uri).
 * @param newLocalName New local name (identifier) for the property.
 * @returns true if rename succeeded.
 */
export function renameDataPropertyInStore(
  store: Store,
  oldSubjectUri: string,
  newLocalName: string
): boolean {
  if (!newLocalName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newLocalName)) return false;
  // Use class namespace (default ontology #) so serialization uses :name not <...#Ontology#name>
  const ns = getClassNamespace(store) ?? BASE_IRI;
  const base = ns.endsWith('#') ? ns : ns + '#';
  const newUri = base + newLocalName;
  if (oldSubjectUri === newUri) return true;
  const oldSubject = DataFactory.namedNode(oldSubjectUri);
  const newSubject = DataFactory.namedNode(newUri);
  const quadsWithOldSubject = store.getQuads(oldSubject, null, null, null);
  const quadsWithOldObject = store.getQuads(null, null, oldSubject, null);
  const graph = quadsWithOldSubject[0]?.graph ?? quadsWithOldObject[0]?.graph ?? DataFactory.defaultGraph();
  for (const q of quadsWithOldSubject) {
    store.addQuad(
      newSubject,
      q.predicate,
      q.object,
      q.graph.termType === 'DefaultGraph' ? graph : q.graph
    );
  }
  for (const q of quadsWithOldObject) {
    store.addQuad(
      q.subject,
      q.predicate,
      newSubject,
      q.graph.termType === 'DefaultGraph' ? graph : q.graph
    );
  }
  for (const q of quadsWithOldSubject) store.removeQuad(q);
  for (const q of quadsWithOldObject) store.removeQuad(q);
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
