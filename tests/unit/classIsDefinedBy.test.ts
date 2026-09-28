import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseRdfToGraph, getMainOntologyBase } from '../../src/parser';
import { isDefinedElsewhere } from '../../src/graph/definedElsewhere';

describe('class node carries rdfs:isDefinedBy', () => {
  it('populates isDefinedBy on a locally-declared external stub and flags it defined-elsewhere', async () => {
    const ttl = readFileSync(join(__dirname, '../fixtures/localExternalStubSubclass.ttl'), 'utf-8');
    const result = await parseRdfToGraph(ttl, { path: 'localExternalStubSubclass.ttl' });

    const geometry = result.graphData.nodes.find((n) => n.id === 'Geometry');
    const boundingBox = result.graphData.nodes.find((n) => n.id === 'BoundingBox');
    expect(geometry?.isDefinedBy).toBe('http://www.opengis.net/ont/geosparql#');
    expect(boundingBox?.isDefinedBy).toBeUndefined();

    const mainBase = getMainOntologyBase(result.store);
    expect(isDefinedElsewhere(geometry!, mainBase)).toBe(true);
    expect(isDefinedElsewhere(boundingBox!, mainBase)).toBe(false);
  });
});
