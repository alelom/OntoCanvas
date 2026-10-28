import { extractLocalName } from './utils/localName';
import { BASE_IRI, namespaceFromUri } from './ontology/vocab';
export { storeToTurtle, quadsAreDifferent } from './ontology/serialize';
export { updateEdgeInStore, addEdgeToStore, removeEdgeFromStore } from './ontology/editEdges';
export { findRestrictionBlank, addDataPropertyRestrictionToClass, removeDataPropertyRestrictionFromClass, getDataPropertyRestrictionsForClass, addRestrictionToStore, removeRestrictionFromStore, removeRestrictionEdgeFromStore } from './ontology/editRestrictions';
export { addObjectPropertyToStore, updateObjectPropertyLabelInStore, updateObjectPropertyCommentInStore, updateObjectPropertyDomainRangeInStore, updateObjectPropertySubPropertyOfInStore, updateObjectPropertyIsDefinedByInStore, renameObjectPropertyInStore, removeObjectPropertyFromStore } from './ontology/editObjectProperties';
export { addDataPropertyToStore, updateDataPropertyLabelInStore, updateDataPropertyCommentInStore, updateDataPropertyIsDefinedByInStore, updateDataPropertyRangeInStore, updateDataPropertyDomainsInStore, removeDataPropertyFromStore, renameDataPropertyInStore } from './ontology/editDataProperties';
export { updateAnnotationPropertyValueInStore, addAnnotationPropertyToStore, updateAnnotationPropertyLabelInStore, updateAnnotationPropertyCommentInStore, updateAnnotationPropertyIsBooleanInStore, updateAnnotationPropertyRangeInStore, getAnnotationPropertyUriFromStore, removeAnnotationPropertyFromStore } from './ontology/editAnnotationProperties';
export { updateLabelInStore, updateCommentInStore, updateLabellableInStore, deriveNewNodeIdentifier, addNodeToStore, removeNodeFromStore, namesOwlThing } from './ontology/editClasses';
export { quadsToParseResult, parseTtlToGraph, parseRdfToGraph } from './ontology/buildGraph';
export type { ParseResult, ParseRdfToGraphOptions } from './ontology/buildGraph';
export { getMainOntologyBase, getClassNamespace, getObjectProperties, getAnnotationProperties, getDataProperties } from './ontology/readOntology';

// Re-exported so the modules that import them from here keep working until they import src/ontology/vocab directly (#193).
export { BASE_IRI, namespaceFromUri };

// Re-export for convenience
export { extractLocalName, extractLocalName as extractLocalNameFromUri };

import type { SerializerType } from './storage';

// Re-export for convenience
export type { SerializerType };

