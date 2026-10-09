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
  /** Full URI of the class (the rdf:type owl:Class subject). Used to detect when a class lives in
   * a namespace outside the main ontology (defined elsewhere), independent of rdfs:isDefinedBy. */
  uri?: string;
  /**
   * rdfs:isDefinedBy (URI of the defining ontology), when the class is declared locally but
   * defined elsewhere (a "typing stub" reused for alignment, e.g. geo:Geometry). When this points
   * outside the main ontology the node is shown dimmed and treated as read-only, like an import.
   */
  isDefinedBy?: string | null;
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
  /** Declared only in an imported ontology and not used in this file (#104): listed in the menu as
   * read-only context. */
  contextOnly?: boolean;
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
  /** When rdfs:range is an anonymous data range (facets, union, …): its readable form, e.g.
   * `xsd:decimal [0.0, 1.0]`. `range` then holds just the base type, when there is one (#63). */
  rangeExpression?: string;
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
  /** Declared only in an imported ontology and not used in this file (#104): listed in the menu as
   * read-only context, never drawn on the canvas. */
  contextOnly?: boolean;
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
  /** The restriction kinds this edge stands for (several when e.g. both ∃ and ∀ restrict the same
   * property to the same class). See src/rdf/restrictions.ts (#63). */
  restrictionKinds?: RestrictionKind[];
  /** For a `value` (owl:hasValue) restriction: the individual's local name. */
  restrictionValue?: string;
  /** Drawn from an anonymous class expression in the property's rdfs:domain or rdfs:range (∪ ∩ ¬ {}), or a
   * restriction edge drawn for such a pair. Writing it back as one domain/range pair would rewrite the
   * expression, so the editor keeps it read-only (#58). */
  fromClassExpression?: boolean;
  /** A restriction whose filler is an imported class, drawn by the external expansion (#99). The store
   * writers resolve a target as a class of this ontology, so the editor keeps it read-only. */
  externalTarget?: boolean;
}

/** OWL restriction kinds drawn as edges: ∃ some, ∀ only, ∋ value, ⟲ self, and qualified / unqualified
 * cardinality (#63). */
export type RestrictionKind = 'some' | 'only' | 'value' | 'self' | 'qualified' | 'unqualified';

/**
 * An anonymous OWL class expression (e.g. owl:unionOf) that appears in a property's rdfs:domain.
 * Rendered as a grouping (convex hull / junction) over its member class nodes rather than as a
 * "fictional" node, with the property edge attached to the group. See issue #59.
 */
/** OWL class-expression constructors rendered on the graph: owl:unionOf (#59), owl:intersectionOf
 * (#60), owl:complementOf (#61) and owl:oneOf (#62). */
export type ClassExpressionOperator = 'union' | 'intersection' | 'complement' | 'oneOf';

export interface ClassExpressionGroup {
  /** The constructor of the expression. */
  operator: ClassExpressionOperator;
  /** Local names (graph node ids) of the classes the expression is drawn against: the operands of a
   * union / intersection / complement, or the named types of a oneOf's individuals (empty when the
   * enumerated individuals have no class on the graph, or are literals). */
  members: string[];
  /** oneOf only: the enumerated individuals (local names) or literal values, in list order. */
  values?: string[];
  /** The whole expression in description-logic notation, e.g. `¬(Agent ∪ OnlineAccount)` (#63). */
  formula?: string;
  /** Whether the expression has anonymous operands (nested expressions or restrictions), so the members
   * alone don't say it all and the formula should be shown. */
  nested?: boolean;
  /** Local name of the property whose domain or range is this expression. */
  propertyName: string;
  /** Full URI of the property. */
  propertyUri?: string;
  /** Local names of the in-graph classes on the OPPOSITE end of the property (resolved through an
   * expression there too): the range classes for a domain expression, the domain classes for a range
   * expression. Each member edge runs between a member and a counterpart. For a data property's range
   * expression these are the classes whose stub nodes carry the mark. */
  counterparts: string[];
  /** Which end of the property the expression sits on. */
  position: 'domain' | 'range';
  /** Whether the carrying property is an object or datatype property. */
  propertyKind: 'object' | 'data';
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Anonymous class expressions (union / intersection / complement / oneOf in a domain or range)
   * to render as overlay marks. */
  classExpressions?: ClassExpressionGroup[];
}

export type BorderLineType = 'solid' | 'dashed' | 'dotted' | 'dash-dot' | 'dash-dot-dot';
