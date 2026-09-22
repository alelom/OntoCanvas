/** Rendered width/height of a node's box, used by the layout algorithms. */
export interface NodeDimensions {
  width: number;
  height: number;
}

/** Data property restriction on a class (min/max cardinality). */
export interface DataPropertyRestriction {
  propertyName: string;
  minCardinality?: number | null;
  maxCardinality?: number | null;
  /**
   * Full URI of the owl:onDataRange asserted by this restriction. This is a datatype the document
   * really does state for the property on this class, so it is shown even when the property itself
   * declares no rdfs:range.
   */
  onDataRange?: string;
}

export interface GraphNode {
  id: string;
  label: string;
  labellableRoot: boolean | null;
  /** rdfs:comment from the ontology */
  comment?: string | null;
  annotations?: Record<string, string | boolean | null>;
  /** Data property restrictions (owl:Restriction with owl:onDataRange) on this class */
  dataPropertyRestrictions?: DataPropertyRestriction[];
  /** Example image URIs (multi-valued annotation property exampleImage); relative e.g. img/foo.png or absolute */
  exampleImages?: string[];
  x?: number;
  y?: number;
  /** True when this node is from an external ontology (read-only, 50% opacity, "Open external ontology" in context menu). */
  isExternal?: boolean;
  /** URL of the external ontology that defines this node. Set when isExternal is true. */
  externalOntologyUrl?: string;
}

export interface AnnotationPropertyInfo {
  name: string;
  isBoolean: boolean; // Deprecated: kept for backward compatibility, use range instead
  /** Full URI of the datatype range (e.g. http://www.w3.org/2001/XMLSchema#boolean). null means no range specified. */
  range?: string | null;
  /** Full URI of the annotation property */
  uri?: string;
  /** rdfs:isDefinedBy (URI of defining ontology). If set, property is imported. */
  isDefinedBy?: string | null;
  /** rdfs:comment of the property, used e.g. as the value-input placeholder in the editor. */
  comment?: string | null;
}

export interface ObjectPropertyInfo {
  name: string;
  label: string;
  hasCardinality: boolean;
  /** rdfs:comment from the ontology */
  comment?: string | null;
  /**
   * Domain class local name (rdfs:domain), or null/undefined when none is asserted.
   * An asserted owl:Thing is reported through `hasGlobalDomain` instead, not here.
   */
  domain?: string | null;
  /** Range class local name (rdfs:range), or null/undefined when none is asserted. */
  range?: string | null;
  /**
   * True when rdfs:domain owl:Thing is asserted. Kept apart from an absent domain so that an
   * ontology asserting the universal domain still says so after a load-and-save round trip.
   */
  hasGlobalDomain?: boolean;
  /** True when rdfs:range owl:Thing is asserted. */
  hasGlobalRange?: boolean;
  /** Full URI of the property (used to disambiguate when local name is shared, e.g. hasGeometry from GeoSPARQL vs DAnO). */
  uri?: string;
  /** rdfs:isDefinedBy (URI of defining ontology). Read-only in edit. */
  isDefinedBy?: string | null;
  /** rdfs:subPropertyOf (single parent object property URI or local name). */
  subPropertyOf?: string | null;
}

export interface DataPropertyInfo {
  name: string;
  label: string;
  /** rdfs:comment from the ontology */
  comment?: string | null;
  /**
   * Full URI of the datatype asserted by rdfs:range (e.g. http://www.w3.org/2001/XMLSchema#string).
   * `null` when the ontology asserts no range. Absence is never filled in with a default: a stub
   * declared as a name only must stay distinguishable from a property that asserts xsd:string.
   */
  range: string | null;
  /**
   * Range this property inherits through rdfs:subPropertyOf from a super-property whose range is
   * declared *in the same loaded document*. Only set when `range` is null. Never resolved by
   * fetching external ontologies, which would make the view non-deterministic.
   */
  inheritedRange?: { range: string; from: string } | null;
  /**
   * Domain class local names asserted by rdfs:domain. Empty when the property is global
   * (`hasGlobalDomain`) or when no domain is asserted at all — see `hasGlobalDomain` to tell those apart.
   */
  domains: string[];
  /**
   * True when rdfs:domain owl:Thing is asserted, i.e. the property explicitly applies to every class.
   * False with an empty `domains` means no domain was asserted, which is not the same claim.
   */
  hasGlobalDomain: boolean;
  /** Full URI of the property (for display and rename). */
  uri?: string;
  /** rdfs:isDefinedBy (URI of defining ontology). If set, label is read-only (imported). */
  isDefinedBy?: string | null;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: string;
  /** Min cardinality (null = unbounded). For qualified restrictions. */
  minCardinality?: number | null;
  /** Max cardinality (null = unbounded). For qualified restrictions. */
  maxCardinality?: number | null;
  /** Target class for qualified cardinality (when different from edge 'to'). */
  onClass?: string;
  /** Whether this edge comes from an OWL restriction (true) or from domain/range definition (false/undefined) */
  isRestriction?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type BorderLineType = 'solid' | 'dashed' | 'dotted' | 'dash-dot' | 'dash-dot-dot';
