import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Store } from 'n3';
import { parseRdfToGraph, getDataProperties } from '../../src/parser';

const XSD = 'http://www.w3.org/2001/XMLSchema#';

describe('data property range: OWL 2 datatype restriction (issue #49)', () => {
  it('resolves an anonymous rdfs:Datatype range to its owl:onDatatype, not a blank-node id', async () => {
    const ttl = readFileSync(join(__dirname, '../fixtures/datatypeRestrictionRange.ttl'), 'utf-8');
    const result = await parseRdfToGraph(ttl, { path: 'datatypeRestrictionRange.ttl' });
    const dps = getDataProperties(result.store as unknown as Store);

    const hasConfidence = dps.find((d) => d.name === 'hasConfidence');
    const plain = dps.find((d) => d.name === 'plainProp');

    expect(hasConfidence?.range).toBe(`${XSD}decimal`);
    // The range must not be a blank-node identifier.
    expect(hasConfidence?.range?.startsWith('_:')).toBe(false);
    expect(hasConfidence?.range).not.toMatch(/^(df|n|b)\d/);

    // Plain datatype ranges are unchanged.
    expect(plain?.range).toBe(`${XSD}string`);
  });
});
