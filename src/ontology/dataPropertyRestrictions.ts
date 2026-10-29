/**
 * The data properties of a graph that restrictions name: the restriction each class carries, and the properties a
 * restriction names that the store does not declare. Moved out of buildGraph.ts (#198).
 */
import type { DataPropertyInfo, GraphNode } from '../types';
import { OWL, RDFS, isBlankNode } from './vocab';
import { DataFactory, Store } from 'n3';
import { type RdfTerm } from '../rdf/classExpressions';
import { describeDataRange } from '../rdf/dataRanges';
import { extractLocalName } from '../utils/localName';
import { findInheritedRange, resolveDatatypeRangeValue } from './readDataProperties';
import { getMainOntologyBase } from './ontologyBase';
import { readRestrictionCardinality } from '../rdf/restrictions';

export function addDataPropertyRestrictions(store: Store, nodes: GraphNode[], dataProps: DataPropertyInfo[]): void {
  // Parse data property restrictions (class subClassOf [ owl:onProperty dp ; owl:onDataRange ... ])
  const OWL_ON_DATA_RANGE = OWL + 'onDataRange';
  const referencedDataPropUris = new Set<string>(); // Track data properties referenced in restrictions
  for (const q of store.getQuads(null, RDFS + 'subClassOf', null, null)) {
    const subj = q.subject;
    const obj = q.object;
    if (subj.termType !== 'NamedNode' || !isBlankNode(obj)) continue;
    const onProp = store.getQuads(obj, OWL + 'onProperty', null, null)[0];
    const onDataRange = store.getQuads(obj, DataFactory.namedNode(OWL_ON_DATA_RANGE), null, null)[0];
    if (!onProp || !onDataRange) continue;
    const propUri = (onProp.object as { value: string }).value;
    const propName = extractLocalName(propUri);
    referencedDataPropUris.add(propUri); // Track full URI
    // Qualified (OWL 2, the form used with owl:onDataRange) or unqualified cardinality (#63).
    const { min: minCard, max: maxCard } = readRestrictionCardinality(store, obj as RdfTerm);
    const subjName = extractLocalName((subj as { value: string }).value);
    const node = nodes.find((n) => n.id === subjName);
    if (node && node.dataPropertyRestrictions) {
      node.dataPropertyRestrictions.push({
        propertyName: propName,
        minCardinality: minCard ?? undefined,
        maxCardinality: maxCard ?? undefined,
        onDataRange: (onDataRange.object as { value?: string }).value,
      });
    }
  }
  
  // Add referenced data properties that aren't declared in the store
  for (const propUri of referencedDataPropUris) {
    const propName = extractLocalName(propUri);
    // Check if already in dataProps
    if (!dataProps.some((dp) => dp.name === propName && dp.uri === propUri)) {
      // Try to get label and other info from store, but if not found, use defaults
      const propQuads = store.getQuads(DataFactory.namedNode(propUri), null, null, null);
      let label = propName;
      let comment: string | undefined = undefined;
      let range: string | null = null;
      let rangeExpression: string | undefined;
      let domains: string[] = [];
      let hasGlobalDomain = false;
      
      for (const q of propQuads) {
        const pred = (q.predicate as { value?: string }).value;
        if (pred === RDFS + 'label') {
          label = (q.object as { value?: string }).value ?? propName;
        } else if (pred === RDFS + 'comment') {
          comment = (q.object as { value?: string }).value ?? undefined;
        } else if (pred === RDFS + 'range') {
          range = resolveDatatypeRangeValue(store, q.object as RdfTerm);
          rangeExpression = describeDataRange(store, q.object as RdfTerm) ?? undefined;
        } else if (pred === RDFS + 'domain') {
          const domainUri = (q.object as { value?: string }).value;
          if (domainUri === OWL + 'Thing') {
            hasGlobalDomain = true;
          } else if (domainUri) {
            const domainName = extractLocalName(domainUri);
            if (!domains.includes(domainName)) {
              domains.push(domainName);
            }
          }
        }
      }
      
      // Check if URI belongs to an external ontology (not the main ontology base)
      const isDefinedByQuad = store.getQuads(DataFactory.namedNode(propUri), DataFactory.namedNode(RDFS + 'isDefinedBy'), null, null)[0];
      let isDefinedBy: string | undefined = undefined;
      if (isDefinedByQuad?.object?.termType === 'NamedNode') {
        isDefinedBy = (isDefinedByQuad.object as { value: string }).value;
      } else {
        // If no isDefinedBy, check if URI doesn't belong to main ontology
        const mainBase = getMainOntologyBase(store);
        const mainBaseNormalized = mainBase ? (mainBase.endsWith('#') ? mainBase.slice(0, -1) : mainBase) : null;
        if (mainBaseNormalized && !propUri.startsWith(mainBaseNormalized) && !propUri.startsWith(mainBase!)) {
          // Extract base URL from property URI
          const uriBase = propUri.includes('#') ? propUri.slice(0, propUri.indexOf('#')) : propUri.substring(0, propUri.lastIndexOf('/'));
          if (uriBase && uriBase !== mainBaseNormalized && uriBase !== mainBase) {
            isDefinedBy = uriBase;
          }
        }
      }
      
      dataProps.push({
        name: propName,
        label: String(label),
        comment,
        range,
        ...(rangeExpression ? { rangeExpression } : {}),
        inheritedRange: range ? null : findInheritedRange(store, propUri),
        domains,
        hasGlobalDomain,
        uri: propUri,
        isDefinedBy,
      });
    }
  }
}
