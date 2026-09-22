/**
 * Unit tests for how a data property's asserted facts become what the canvas shows.
 *
 * Regression guard for https://github.com/alelom/OntoCanvas/issues/25: a property with no
 * rdfs:range was rendered as xsd:string, and a property with no rdfs:domain was attached to every
 * class. Absence of an assertion must stay visible as absence.
 */
import { describe, it, expect } from 'vitest';
import {
  formatRangeUri,
  describeRange,
  domainAttachment,
  appliesToClass,
  XSD_NS,
  RDFS_NS,
} from '../../src/lib/dataPropertyDisplay';

describe('formatRangeUri', () => {
  it('shortens known datatypes to their prefixed form', () => {
    expect(formatRangeUri(XSD_NS + 'string')).toBe('xsd:string');
    expect(formatRangeUri(XSD_NS + 'dateTime')).toBe('xsd:dateTime');
    expect(formatRangeUri(RDFS_NS + 'Literal')).toBe('rdfs:Literal');
  });

  it('prefixes any other xsd or rdfs datatype by namespace', () => {
    expect(formatRangeUri(XSD_NS + 'gYear')).toBe('xsd:gYear');
    expect(formatRangeUri(RDFS_NS + 'Datatype')).toBe('rdfs:Datatype');
  });

  it('falls back to the local name, then to the whole URI', () => {
    expect(formatRangeUri('http://example.org/types#Money')).toBe('Money');
    expect(formatRangeUri('http://example.org/types/Money')).toBe('http://example.org/types/Money');
  });
});

describe('describeRange', () => {
  it('shows an asserted range in parentheses', () => {
    const d = describeRange({ range: XSD_NS + 'string', inheritedRange: null });
    expect(d.source).toBe('asserted');
    expect(d.labelSuffix).toBe(' (xsd:string)');
    expect(d.menuLabel).toBe('xsd:string');
  });

  it('shows nothing at all when no range is asserted', () => {
    const d = describeRange({ range: null, inheritedRange: null });
    expect(d.source).toBe('unasserted');
    expect(d.labelSuffix).toBe('');
    expect(d.tooltipNote).toMatch(/No rdfs:range asserted/);
  });

  it('keeps an unasserted range distinguishable from an asserted rdfs:Literal', () => {
    const assertedLiteral = describeRange({ range: RDFS_NS + 'Literal', inheritedRange: null });
    const unasserted = describeRange({ range: null, inheritedRange: null });
    expect(assertedLiteral.labelSuffix).toBe(' (rdfs:Literal)');
    expect(unasserted.labelSuffix).not.toBe(assertedLiteral.labelSuffix);
  });

  it('marks an inherited range as inherited rather than asserted', () => {
    const d = describeRange({
      range: null,
      inheritedRange: { range: XSD_NS + 'dateTime', from: 'timestamp' },
    });
    expect(d.source).toBe('inherited');
    expect(d.labelSuffix).toBe(' (inherited xsd:dateTime)');
    expect(d.labelSuffix).not.toBe(' (xsd:dateTime)');
    expect(d.tooltipNote).toContain('timestamp');
  });

  it('prefers an asserted range over an inherited one', () => {
    const d = describeRange({
      range: XSD_NS + 'date',
      inheritedRange: { range: XSD_NS + 'dateTime', from: 'timestamp' },
    });
    expect(d.source).toBe('asserted');
    expect(d.labelSuffix).toBe(' (xsd:date)');
  });

  it('treats a missing property as unasserted', () => {
    expect(describeRange(undefined).source).toBe('unasserted');
  });

  it('uses a restriction owl:onDataRange when the property declares no range', () => {
    const d = describeRange({ range: null, inheritedRange: null }, XSD_NS + 'dateTime');
    expect(d.source).toBe('restriction');
    expect(d.labelSuffix).toBe(' (xsd:dateTime)');
    expect(d.tooltipNote).toContain('owl:onDataRange');
    expect(d.tooltipNote).toContain('No rdfs:range asserted');
  });

  it('prefers the property own range over a restriction data range', () => {
    const d = describeRange({ range: XSD_NS + 'string', inheritedRange: null }, XSD_NS + 'dateTime');
    expect(d.source).toBe('asserted');
    expect(d.labelSuffix).toBe(' (xsd:string)');
  });

  it('prefers a restriction data range over an inherited one, being an assertion about this class', () => {
    const d = describeRange(
      { range: null, inheritedRange: { range: XSD_NS + 'date', from: 'timestamp' } },
      XSD_NS + 'dateTime'
    );
    expect(d.source).toBe('restriction');
    expect(d.labelSuffix).toBe(' (xsd:dateTime)');
  });
});

describe('domainAttachment', () => {
  it('reports the asserted domain classes', () => {
    expect(domainAttachment({ domains: ['Event'], hasGlobalDomain: false })).toBe('domains');
  });

  it('distinguishes an asserted owl:Thing domain from no domain at all', () => {
    expect(domainAttachment({ domains: [], hasGlobalDomain: true })).toBe('global');
    expect(domainAttachment({ domains: [], hasGlobalDomain: false })).toBe('unattached');
  });
});

describe('appliesToClass', () => {
  it('attaches a property only to the classes its domain names', () => {
    const dp = { domains: ['Event'], hasGlobalDomain: false };
    expect(appliesToClass(dp, 'Event')).toBe(true);
    expect(appliesToClass(dp, 'Concept')).toBe(false);
  });

  it('attaches an explicitly global property to every class', () => {
    const dp = { domains: [], hasGlobalDomain: true };
    expect(appliesToClass(dp, 'Event')).toBe(true);
    expect(appliesToClass(dp, 'Concept')).toBe(true);
  });

  it('attaches a property with no asserted domain to nothing', () => {
    const dp = { domains: [], hasGlobalDomain: false };
    expect(appliesToClass(dp, 'Event')).toBe(false);
    expect(appliesToClass(dp, 'Concept')).toBe(false);
  });
});
