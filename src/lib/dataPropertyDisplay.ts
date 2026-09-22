/**
 * How a data property's asserted facts turn into what the canvas shows (pure, no DOM).
 *
 * The rule this module exists to enforce: absence of an assertion is information. A property that
 * declares no rdfs:range must not be shown as though it declared one, and a property that declares
 * no rdfs:domain must not be shown hanging off classes it was never attached to. Typing stubs —
 * external terms declared locally as a name only, with their axioms left at the source — depend on
 * that distinction being visible.
 */
import type { DataPropertyInfo } from '../types';

export const XSD_NS = 'http://www.w3.org/2001/XMLSchema#';
export const RDFS_NS = 'http://www.w3.org/2000/01/rdf-schema#';

/** Datatypes offered in the range dropdowns, and the short labels used on the canvas. */
export const DATA_PROPERTY_RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: XSD_NS + 'string', label: 'xsd:string' },
  { value: XSD_NS + 'integer', label: 'xsd:integer' },
  { value: XSD_NS + 'decimal', label: 'xsd:decimal' },
  { value: XSD_NS + 'boolean', label: 'xsd:boolean' },
  { value: XSD_NS + 'date', label: 'xsd:date' },
  { value: XSD_NS + 'dateTime', label: 'xsd:dateTime' },
  { value: XSD_NS + 'anyURI', label: 'xsd:anyURI' },
  { value: RDFS_NS + 'Literal', label: 'rdfs:Literal' },
];

/**
 * Format a range URI to short form (e.g. "http://www.w3.org/2001/XMLSchema#string" → "xsd:string").
 * Known datatypes use their prefixed label; anything else falls back to the local name.
 */
export function formatRangeUri(rangeUri: string): string {
  const knownOption = DATA_PROPERTY_RANGE_OPTIONS.find((opt) => opt.value === rangeUri);
  if (knownOption) return knownOption.label;

  const hashIndex = rangeUri.indexOf('#');
  if (hashIndex !== -1 && hashIndex < rangeUri.length - 1) {
    const localName = rangeUri.substring(hashIndex + 1);
    if (rangeUri.startsWith(XSD_NS)) return `xsd:${localName}`;
    if (rangeUri.startsWith(RDFS_NS)) return `rdfs:${localName}`;
    return localName;
  }

  return rangeUri;
}

/** Where a property's displayed datatype came from. */
export type RangeSource = 'asserted' | 'restriction' | 'inherited' | 'unasserted';

export interface RangeDisplay {
  source: RangeSource;
  /**
   * Text appended to the node label, including its own separator, or '' when nothing should be
   * shown. An unasserted range appends nothing at all, so it cannot be mistaken for an assertion.
   */
  labelSuffix: string;
  /** Short text for list views (the Data Properties menu), where a column is always rendered. */
  menuLabel: string;
  /** Sentence for the node tooltip explaining what the ontology does and does not say. */
  tooltipNote: string;
}

/**
 * Decide how to present a data property's datatype.
 *
 * An asserted range renders as "(xsd:string)". A range inherited through rdfs:subPropertyOf from a
 * super-property declared in the same document renders as "(inherited xsd:dateTime)", marked so it
 * is never read as this property's own assertion. An unasserted range renders as nothing, and says
 * so in the tooltip.
 *
 * @param restrictionDataRange owl:onDataRange asserted by the restriction this node stands for, if
 * any. It is a real assertion about the property on that class, so it is shown when the property
 * itself declares no rdfs:range — but it is attributed to the restriction, not to the property.
 */
export function describeRange(
  dp: Pick<DataPropertyInfo, 'range' | 'inheritedRange'> | undefined,
  restrictionDataRange?: string | null
): RangeDisplay {
  const asserted = dp?.range;
  if (!asserted && restrictionDataRange) {
    const label = formatRangeUri(restrictionDataRange);
    return {
      source: 'restriction',
      labelSuffix: ` (${label})`,
      menuLabel: label,
      tooltipNote: `No rdfs:range asserted on the property. This class restricts it to ${label} via owl:onDataRange.`,
    };
  }
  if (asserted) {
    const label = formatRangeUri(asserted);
    return {
      source: 'asserted',
      labelSuffix: ` (${label})`,
      menuLabel: label,
      tooltipNote: `rdfs:range ${label}`,
    };
  }

  const inherited = dp?.inheritedRange;
  if (inherited) {
    const label = formatRangeUri(inherited.range);
    return {
      source: 'inherited',
      labelSuffix: ` (inherited ${label})`,
      menuLabel: `inherited ${label}`,
      tooltipNote: `No rdfs:range asserted. Inherited ${label} from the super-property ${inherited.from} declared in this document.`,
    };
  }

  return {
    source: 'unasserted',
    labelSuffix: '',
    menuLabel: 'no range asserted',
    tooltipNote: 'No rdfs:range asserted in this ontology, so no datatype is shown.',
  };
}

/** How a property is attached to the class graph. */
export type DomainAttachment = 'domains' | 'global' | 'unattached';

/**
 * Classify a property by its rdfs:domain.
 *
 * `domains` lists the classes it is asserted on. `global` means rdfs:domain owl:Thing was asserted,
 * which really does apply to every class. `unattached` means no domain was asserted at all — that is
 * not a claim about any class, so the property must not be drawn on one.
 */
export function domainAttachment(dp: Pick<DataPropertyInfo, 'domains' | 'hasGlobalDomain'>): DomainAttachment {
  if (dp.domains.length > 0) return 'domains';
  return dp.hasGlobalDomain ? 'global' : 'unattached';
}

/** Whether a data property should be drawn attached to the given class node. */
export function appliesToClass(
  dp: Pick<DataPropertyInfo, 'domains' | 'hasGlobalDomain'>,
  classId: string
): boolean {
  const attachment = domainAttachment(dp);
  if (attachment === 'unattached') return false;
  if (attachment === 'global') return true;
  return dp.domains.includes(classId);
}

/** Prefix of the graph node id used for a property drawn in the free-standing band. */
export const UNATTACHED_NODE_ID_PREFIX = '__dataprop__unattached__';

/** Graph node id of the free-standing node that stands for a domainless data property. */
export function unattachedDataPropertyNodeId(propertyName: string): string {
  return UNATTACHED_NODE_ID_PREFIX + propertyName;
}

/** Tooltip sentence explaining why an unattached property floats free of the class graph. */
export const UNATTACHED_DOMAIN_NOTE =
  'No rdfs:domain asserted in this ontology, so this property is not attached to any class.';
