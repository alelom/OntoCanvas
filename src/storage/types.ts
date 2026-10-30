import type { BorderLineType } from '../types';
import type { SearchScope } from '../lib/searchHighlight';

/** How to position external ontology nodes relative to the graph. */
export type ExternalNodeLayout = 'auto' | 'right' | 'top' | 'bottom' | 'left';

export interface DisplayConfig {
  version: number;
  nodePositions: Record<string, { x: number; y: number }>;
  edgeStyleConfig: Record<string, { show: boolean; showLabel: boolean; color: string; lineType?: BorderLineType }>;
  wrapChars: number;
  minFontSize: number;
  maxFontSize: number;
  relationshipFontSize: number;
  dataPropertyFontSize?: number;
  layoutMode: string;
  searchQuery: string;
  /** How search shows results (#85); configs from before it only have includeNeighbors. */
  searchScope?: SearchScope;
  /** Legacy (before #85): true for the "matches and their neighbours" scope. */
  includeNeighbors?: boolean;
  /** When true (default), search matches whole names rather than substrings. */
  exactMatch?: boolean;
  annotationStyleConfig?: unknown;
  /** Annotation property local names in priority order (highest first); drives styling precedence. */
  annotationPropertyOrder?: string[];
  viewState?: { scale: number; position: { x: number; y: number } };
  /** Whether to show nodes from external ontologies (referenced by object property domain/range). */
  displayExternalReferences?: boolean;
  /** Draw data properties with domain owl:Thing once, under an owl:Thing node (default), rather than under every class (#80). */
  clusterThingDataProperties?: boolean;
  /** Layout of external nodes: auto (use main layout) or always place right/top/bottom/left of connected local node. */
  externalNodeLayout?: ExternalNodeLayout;
  /** The relationships that make the tiers of the hierarchical layouts (#151); `["subClassOf"]` when absent. */
  hierarchyRelationships?: string[];
  /** Stack many leaf children in a block under their parent in the tiered layouts (#159); true when absent. */
  stackLeaves?: boolean;
  /** Spread the individuals drawn in the graph clear of the classes and of each other (#209); true when absent. */
  relaxIndividuals?: boolean;
}

export interface ExternalOntologyReference {
  url: string;
  usePrefix: boolean;
  prefix?: string; // Optional prefix name (e.g., 'dc', 'schema')
  /** Opacity for imported classes and data properties from this ontology (0.1 to 1.0, default 0.5) */
  opacity?: number;
}

export type SerializerType = 'custom' | 'rdflib';

export interface SerializerConfig {
  serializerType: SerializerType;
}
