/**
 * The examples of the prefixes of an RDF/XML and a JSON-LD file (#187) must keep giving what they promise: the file's own
 * prefixes in the query panel's starting PREFIX lines, and the two classes in the graph.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRdfToGraph } from '../../src/ontology/buildGraph';
import { prefixHeader } from '../../src/sparql/prefixHeader';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../examples/sparql');
const load = (name: string) => {
  const path = join(DIR, name);
  return parseRdfToGraph(readFileSync(path, 'utf-8'), { path });
};

describe('examples/sparql/rdfxml-prefixes.rdf', () => {
  it("starts the query panel with the root element's namespaces, the default one included", async () => {
    const { prefixes } = await load('rdfxml-prefixes.rdf');

    expect(prefixes).toMatchObject({ '': 'http://example.org/examples/rdfxml-prefixes#', ex: 'http://example.org/examples/other/' });
    const header = prefixHeader(prefixes ?? {});
    expect(header).toContain('PREFIX : <http://example.org/examples/rdfxml-prefixes#>');
    expect(header).toContain('PREFIX ex: <http://example.org/examples/other/>');
  });

  it('draws two classes, Hall below Room', async () => {
    const { graphData } = await load('rdfxml-prefixes.rdf');

    expect(graphData.nodes.map((n) => n.label).sort()).toEqual(['Hall', 'Room']);
    expect(graphData.edges).toHaveLength(1);
  });
});

describe('examples/sparql/jsonld-prefixes.jsonld', () => {
  it('starts the query panel with the namespace terms of the context, and not the term shortcuts', async () => {
    const { prefixes } = await load('jsonld-prefixes.jsonld');

    expect(prefixes).toMatchObject({ ex: 'http://example.org/examples/jsonld-prefixes#', other: 'http://example.org/examples/other/' });
    expect(Object.keys(prefixes ?? {})).not.toContain('label');
    expect(Object.keys(prefixes ?? {})).not.toContain('subClassOf');
    expect(prefixHeader(prefixes ?? {})).toContain('PREFIX ex: <http://example.org/examples/jsonld-prefixes#>');
  });

  it('draws two classes, Hall below Room', async () => {
    const { graphData } = await load('jsonld-prefixes.jsonld');

    expect(graphData.nodes.map((n) => n.label).sort()).toEqual(['Hall', 'Room']);
    expect(graphData.edges).toHaveLength(1);
  });
});
