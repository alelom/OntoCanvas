import { describe, it, expect } from 'vitest';
import { buildSearchVocabulary } from './searchVocabulary';
import { buildSearchSuggestions } from '../lib/searchSuggestions';
import { computeSearchSets } from '../lib/searchHighlight';
import type { DataPropertyInfo, GraphEdge, GraphNode, ObjectPropertyInfo } from '../types';

const FOAF = 'http://xmlns.com/foaf/0.1/';

/** A FOAF-like graph: properties outside the main namespace are stored by full IRI (#81). */
describe('search vocabulary (#81)', () => {
  const nodes: GraphNode[] = [
    { id: 'Group', label: 'Group', labellableRoot: null },
    { id: 'Agent', label: 'Agent', labellableRoot: null },
  ];
  const edges: GraphEdge[] = [{ from: 'Group', to: 'Agent', type: `${FOAF}member` }];
  const objectProperties = [{ name: 'member', label: 'member', uri: `${FOAF}member`, isDefinedBy: FOAF }] as unknown as ObjectPropertyInfo[];
  const dataProperties = [
    { name: 'yahooChatID', label: 'Yahoo chat ID', uri: `${FOAF}yahooChatID`, isDefinedBy: FOAF, domains: ['Agent'], hasGlobalDomain: false, range: null },
    { name: 'name', label: 'name', uri: `${FOAF}name`, isDefinedBy: FOAF, domains: [], hasGlobalDomain: true, range: null },
  ] as unknown as DataPropertyInfo[];
  const vocab = buildSearchVocabulary({
    nodes,
    edgeTypes: [`${FOAF}member`],
    objectProperties,
    dataProperties,
    externalOntologyReferences: [{ url: FOAF, usePrefix: true, prefix: 'foaf' }],
    mainOntologyBase: 'http://example.org/main#',
  });

  it('suggests foaf:member, not the full IRI', () => {
    const [s] = buildSearchSuggestions('member', vocab.sources);
    expect(s).toMatchObject({ display: 'foaf:member', title: `${FOAF}member`, hint: 'relationship' });
  });

  it('suggests data properties by prefixed name', () => {
    expect(buildSearchSuggestions('yahoo', vocab.sources).map((s) => [s.display, s.hint])).toEqual([['foaf:yahooChatID', 'data property']]);
  });

  it('choosing a suggestion finds it: the prefixed name matches, in exact mode too', () => {
    for (const exact of [false, true]) {
      const rel = computeSearchSets(nodes, edges, 'foaf:member', false, exact, { ...vocab.extras, dataProperties: vocab.dataProperties });
      expect(rel.matchingEdgeIds.size).toBe(1);
      const dp = computeSearchSets(nodes, edges, 'foaf:yahooChatID', false, exact, { ...vocab.extras, dataProperties: vocab.dataProperties });
      expect(dp.matchingDataPropertyNames).toEqual(new Set(['yahooChatID']));
      expect(dp.matchingNodeIds).toEqual(new Set(['Agent']));
    }
  });

  it('a data property with domain owl:Thing sits on every class', () => {
    expect(vocab.dataProperties.find((d) => d.name === 'name')?.classIds).toEqual(['Group', 'Agent']);
  });
});
