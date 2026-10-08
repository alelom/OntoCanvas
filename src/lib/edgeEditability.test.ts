import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../parser';
import { edgeLock } from './edgeEditability';
import type { GraphEdge } from '../types';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures');

const PREFIXES = `@prefix : <http://example.org/o#> .
@prefix ext: <http://example.org/ext#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/o> a owl:Ontology .
`;
const parse = async (ttl: string) => (await parseRdfToGraph(PREFIXES + ttl, { path: 'o.ttl' })).graphData.edges;
const find = (edges: GraphEdge[], from: string, to: string, type: string) => edges.find((e) => e.from === from && e.to === to && e.type === type);

/** Which edges the editor may write back (#58, #63). The lock is decided from where the parser drew the
 * edge from, not from the display groups: those leave out expressions too small to mark. */
describe('edgeLock', () => {
  it('locks an edge drawn from a class expression: writing it back would rewrite the expression (#58)', async () => {
    // hasOrientation: domain Section ∪ Detail. Deleting one edge removed the shared rdfs:range; editing one
    // added an rdfs:domain beside the union, turning OR into AND.
    const r = await parseRdfToGraph(readFileSync(join(FIXTURES, 'unionDomain.ttl'), 'utf-8'), { path: 'unionDomain.ttl' });
    for (const from of ['Section', 'Detail']) {
      const e = find(r.graphData.edges, from, 'OrientationValue', 'hasOrientation')!;
      expect(e.fromClassExpression).toBe(true);
      expect(edgeLock(e)).toBe('classExpression');
    }
  });

  it('locks it even when the expression has a single visible member (no mark is drawn for it)', async () => {
    // ext:Other isn't declared here, so only Section is drawn; the union is still in the file.
    const edges = await parse(`:Section a owl:Class . :Value a owl:Class .
:p a owl:ObjectProperty ; rdfs:domain [ a owl:Class ; owl:unionOf ( :Section ext:Other ) ] ; rdfs:range :Value .`);
    expect(edgeLock(find(edges, 'Section', 'Value', 'p')!)).toBe('classExpression');
  });

  it('locks a restriction edge drawn for the same pair as an expression (it replaces the domain/range edge)', async () => {
    const edges = await parse(`:Person a owl:Class ; rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :knows ; owl:someValuesFrom :Group ] .
:Group a owl:Class .
:knows a owl:ObjectProperty ; rdfs:domain :Person ; rdfs:range [ a owl:Class ; owl:unionOf ( :Person :Group ) ] .
:Person rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :knows ; owl:someValuesFrom :Person ] .`);
    expect(edgeLock(find(edges, 'Person', 'Group', 'knows')!)).toBe('classExpression');
    expect(edgeLock(find(edges, 'Person', 'Person', 'knows')!)).toBe('classExpression'); // a self-loop pair
  });

  it('locks a restriction kind the editor cannot write (#63)', () => {
    const only: GraphEdge = { from: 'A', to: 'B', type: 'p', isRestriction: true, restrictionKinds: ['only'] };
    expect(edgeLock(only)).toBe('restriction');
  });

  it('leaves plain domain/range edges and ∃ restrictions editable', async () => {
    const edges = await parse(`:A a owl:Class ; rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :q ; owl:someValuesFrom :B ] .
:B a owl:Class .
:p a owl:ObjectProperty ; rdfs:domain :A ; rdfs:range :B .
:q a owl:ObjectProperty .`);
    expect(edgeLock(find(edges, 'A', 'B', 'p')!)).toBeNull();
    expect(edgeLock(find(edges, 'A', 'B', 'q')!)).toBeNull();
  });
});
