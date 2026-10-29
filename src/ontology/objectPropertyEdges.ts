/**
 * The object properties of a graph: the properties the store declares, those only a restriction names, and the edges
 * their domains and ranges draw. Moved out of buildGraph.ts (#198).
 */
import type { GraphEdge, ObjectPropertyInfo } from '../types';
import { BASE_IRI, OWL, RDF, RDFS, isBlankNode } from './vocab';
import { DataFactory, Store } from 'n3';
import { type RdfTerm, resolveExpressionClassUris } from '../rdf/classExpressions';
import { debugLog } from '../utils/debug';
import { extractLocalName } from '../utils/localName';
import { getMainOntologyBase } from './ontologyBase';
import { getObjectProperties } from './readObjectProperties';
import { isExternalPropertyUri } from '../rdf/propertyNamespace';
import { isNodeOf } from '../graph/classNodeIds';

export function buildObjectPropertyEdges(store: Store, edges: GraphEdge[], classUriByName: Map<string, string>, seenPairs: Set<string>): ObjectPropertyInfo[] {
  const objectProps = getObjectProperties(store);
  
  // Track object properties referenced in restrictions that might not be in the store
  const referencedObjectPropUris = new Set<string>();
  for (const q of store.getQuads(null, RDFS + 'subClassOf', null, null)) {
    const obj = q.object;
    if (!isBlankNode(obj)) continue;
    const onProperty = store.getQuads(obj, OWL + 'onProperty', null, null)[0];
    if (!onProperty || onProperty.object.termType !== 'NamedNode') continue;
    // A data restriction names a data property, listed with the data properties instead (#100).
    if (store.getQuads(obj, OWL + 'onDataRange', null, null).length > 0) continue;
    const propUri = (onProperty.object as { value: string }).value;
    if (store.getQuads(DataFactory.namedNode(propUri), RDF + 'type', OWL + 'DatatypeProperty', null).length > 0) continue;
    referencedObjectPropUris.add(propUri);
  }
  
  // Add referenced object properties that aren't declared in the store
  for (const propUri of referencedObjectPropUris) {
    const propName = extractLocalName(propUri);
    // Check if already in objectProps (by name or URI)
    if (!objectProps.some((op) => op.name === propName || op.uri === propUri)) {
      // Try to get label and other info from store, but if not found, use defaults
      const propQuads = store.getQuads(DataFactory.namedNode(propUri), null, null, null);
      let label = propName;
      let comment: string | undefined = undefined;
      let domain: string | undefined = undefined;
      let range: string | undefined = undefined;
      let hasCardinality = true;
      let isDefinedBy: string | undefined = undefined;
      let subPropertyOf: string | undefined = undefined;
      
      for (const q of propQuads) {
        const pred = (q.predicate as { value?: string }).value;
        if (pred === RDFS + 'label') {
          label = (q.object as { value?: string }).value ?? propName;
        } else if (pred === RDFS + 'comment') {
          comment = (q.object as { value?: string }).value ?? undefined;
        } else if (pred === RDFS + 'domain') {
          const domainUri = (q.object as { value?: string }).value;
          if (domainUri && domainUri !== OWL + 'Thing') {
            domain = extractLocalName(domainUri);
          }
        } else if (pred === RDFS + 'range') {
          const rangeUri = (q.object as { value?: string }).value;
          if (rangeUri && rangeUri !== OWL + 'Thing') {
            range = extractLocalName(rangeUri);
          }
        } else if (pred === RDFS + 'isDefinedBy') {
          if (q.object.termType === 'NamedNode') {
            isDefinedBy = (q.object as { value: string }).value;
          }
        } else if (pred === RDFS + 'subPropertyOf') {
          if (q.object.termType === 'NamedNode') {
            subPropertyOf = (q.object as { value: string }).value;
          }
        }
      }
      
      // Check if URI belongs to an external ontology (not the main ontology base)
      // If isDefinedBy is not found in store, check if URI belongs to external ontology
      if (!isDefinedBy) {
        const mainBase = getMainOntologyBase(store);
        const mainBaseNormalized = mainBase ? (mainBase.endsWith('#') ? mainBase.slice(0, -1) : mainBase).replace(/\/$/, '') : null;
        const mainBaseWithHash = mainBase || '';
        
        // Extract base URL from property URI
        let uriBase: string;
        if (propUri.includes('#')) {
          uriBase = propUri.slice(0, propUri.indexOf('#'));
        } else {
          const lastSlash = propUri.lastIndexOf('/');
          uriBase = lastSlash > 0 ? propUri.substring(0, lastSlash) : propUri;
        }
        uriBase = uriBase.replace(/\/$/, '');
        
        // If URI base doesn't match main ontology base, it's from an external ontology
        if (uriBase && uriBase !== mainBaseNormalized && uriBase !== mainBaseWithHash.replace(/\/$/, '').replace(/#$/, '')) {
          // Check if it matches any owl:imports
          const importQuads = store.getQuads(null, DataFactory.namedNode(OWL + 'imports'), null, null);
          for (const importQuad of importQuads) {
            if (importQuad.object.termType === 'NamedNode') {
              const importUrl = (importQuad.object as { value: string }).value;
              const importUrlNormalized = importUrl.endsWith('#') ? importUrl.slice(0, -1) : importUrl;
              const importUrlBase = importUrlNormalized.replace(/\/$/, '');
              if (uriBase === importUrlBase || uriBase.startsWith(importUrlBase + '/') || uriBase.startsWith(importUrlBase + '#')) {
                isDefinedBy = importUrlNormalized;
                break;
              }
            }
          }
          // If no matching import found but URI is clearly external, use the URI base
          if (!isDefinedBy) {
            isDefinedBy = uriBase;
          }
        }
      }
      
      // For external properties, use full URI as name (consistent with getObjectProperties behavior)
      // This ensures the name matches edge types which are stored as full URIs for external properties
      // Determine if this is an external property
      const isExternal = isDefinedBy || (propUri !== propName && (propUri.startsWith('http://') || propUri.startsWith('https://')));
      const finalName = isExternal ? propUri : propName; // Use full URI for external properties, local name for local
      
      objectProps.push({
        name: finalName,
        label: String(label),
        hasCardinality,
        comment,
        domain,
        range,
        uri: propUri,
        isDefinedBy,
        subPropertyOf,
      });
    }
  }
  

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
    
    const OWL_THING = OWL + 'Thing';
    
    // Use full URI for external properties, local name for local properties — decided exactly as for
    // restriction edges, so one property is one edge type (#87).
    const isExternalProperty = isExternalPropertyUri(propUri, getMainOntologyBase(store), BASE_IRI);
    const propName = isExternalProperty ? propUri : op.name;
    
    // Collect valid domains and ranges
    const validDomains: string[] = [];
    // Classes reached through an anonymous expression rather than named directly: their edges are
    // marked fromClassExpression, so the editor won't write them back as a plain pair (#58).
    const expressionDomains = new Set<string>();
    let hasOwlThingDomain = false;
    for (const domainQuad of domainQuads) {
      const domObj = domainQuad.object;
      if (domObj.termType === 'NamedNode') {
        const domainUri = (domObj as { value: string }).value;
        if (domainUri === OWL_THING) {
          hasOwlThingDomain = true;
          // When domain is owl:Thing, skip creating domain/range edges
          // Edges should only come from actual restrictions, not from owl:Thing domain/range
          break;
        }
        const domainName = extractLocalName(domainUri);
        if (isNodeOf(classUriByName, domainUri)) {
          validDomains.push(domainName);
        }
      } else if (domObj.termType === 'BlankNode') {
        // An anonymous class expression domain (union / intersection / complement / oneOf): flatten to
        // the classes it is drawn against so the relationship is visible. The expression itself is
        // shown by the overlay mark (issues #59-#62).
        for (const uri of resolveExpressionClassUris(store, domObj as RdfTerm)) {
          const name = extractLocalName(uri);
          if (!isNodeOf(classUriByName, uri)) continue;
          expressionDomains.add(name);
          if (!validDomains.includes(name)) validDomains.push(name);
        }
      }
    }
    
    // Collect valid ranges
    const validRanges: string[] = [];
    const expressionRanges = new Set<string>();
    let hasOwlThingRange = false;
    for (const rangeQuad of rangeQuads) {
      const rangeObj = rangeQuad.object;
      if (rangeObj.termType === 'NamedNode') {
        const rangeUri = (rangeObj as { value: string }).value;
        if (rangeUri === OWL_THING) {
          hasOwlThingRange = true;
          // When range is owl:Thing, skip creating domain/range edges
          // Edges should only come from actual restrictions, not from owl:Thing domain/range
          break;
        }
        const rangeName = extractLocalName(rangeUri);
        if (isNodeOf(classUriByName, rangeUri)) {
          validRanges.push(rangeName);
        }
      } else if (rangeObj.termType === 'BlankNode') {
        // An anonymous class expression range (union / intersection / complement / oneOf): flatten to
        // the classes it is drawn against so the relationships are visible. The expression itself is
        // shown by the overlay mark (issues #59-#62).
        for (const uri of resolveExpressionClassUris(store, rangeObj as RdfTerm)) {
          const name = extractLocalName(uri);
          if (!isNodeOf(classUriByName, uri)) continue;
          expressionRanges.add(name);
          if (!validRanges.includes(name)) validRanges.push(name);
        }
      }
    }
    
    // Skip creating domain/range edges if domain or range is owl:Thing
    // owl:Thing means "any class can be used", but it doesn't mean "create edges between all classes"
    // Edges should only be created from actual restrictions (which are processed first)
    if (hasOwlThingDomain || hasOwlThingRange) {
      // Don't create domain/range edges for properties with owl:Thing domain/range
      // The edges will come from actual restrictions if they exist
      debugLog(`[PARSER] Skipping domain/range edges for property ${propName} (has owl:Thing domain/range)`);
      continue;
    }
    
    // For each domain-range pair, create an edge if both classes exist
    // But only if a restriction edge doesn't already exist (restrictions are processed first)
    for (const domainName of validDomains) {
      for (const rangeName of validRanges) {
        const fromClassExpression = expressionDomains.has(domainName) || expressionRanges.has(rangeName);
        // A restriction edge already drawn for this pair (self-loops included) stands in for the expression's
        // edge: deleting it would also remove the domain/range it shares, so it is marked too.
        if (fromClassExpression) {
          const restrictionEdge = edges.find((e) => e.from === domainName && e.to === rangeName && e.type === propName);
          if (restrictionEdge) restrictionEdge.fromClassExpression = true;
        }

        // Skip self-loops unless explicitly allowed
        if (domainName === rangeName) continue;
        
        // Only create edge if it doesn't already exist as a restriction
        // Restrictions are processed first (lines 316-474), so if a restriction exists,
        // seenPairs will already have the key and we skip creating a domain/range edge
        const key = `${domainName}->${rangeName}:${propName}`;
        if (!seenPairs.has(key)) {
          seenPairs.add(key);
          const edge: GraphEdge = { 
            from: domainName, 
            to: rangeName, 
            type: propName,
            isRestriction: false, // Mark as non-restriction (from domain/range, not OWL restriction)
            ...(fromClassExpression ? { fromClassExpression: true } : {}),
          };
          edges.push(edge);
          
          // Debug: Log domain/range edges
          if (propName.includes('describes') || propName.includes('contains') || propName.includes('connectsTo')) {
            debugLog('[DEBUG] Added edge from domain/range:', { edge, propUri, domainName, rangeName });
          }
        } else {
          // A restriction edge already exists for this key - don't create domain/range edge
          // The restriction edge (with cardinality if present) takes precedence
        }
      }
    }
  }
  return objectProps;
}
