/**
 * Unit tests for external expansion: adding external ontology nodes and edges for visualization.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { loadOntologyFromContent } from '../lib/loadOntology';
import { parseTtlToGraph } from '../parser';
import { expandWithExternalRefs, isExternalNodeId } from './externalExpansion';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AEC_DRAWING_PATH = resolve(__dirname, '../../tests/fixtures/aec_drawing_ontology.ttl');

const TASK_ASSIGNMENT_TTL = `
@prefix ta: <http://example.org/task-assignment#> .
@prefix pm: <http://example.org/project-mgmt#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

<http://example.org/task-assignment> a owl:Ontology ;
  owl:imports <http://example.org/project-mgmt> .

ta:Task a owl:Class ; rdfs:label "Task"@en .
ta:Assignment a owl:Class ; rdfs:label "Assignment"@en .

ta:assignedTo a owl:ObjectProperty ;
  rdfs:label "assigned to"@en ;
  rdfs:domain ta:Task ;
  rdfs:range pm:Person .

ta:forProject a owl:ObjectProperty ;
  rdfs:label "for project"@en ;
  rdfs:domain ta:Task ;
  rdfs:range pm:Project .

ta:employedBy a owl:ObjectProperty ;
  rdfs:label "employed by"@en ;
  rdfs:domain pm:Person ;
  rdfs:range pm:Organisation .
`;

describe('expandWithExternalRefs', () => {
  it('returns rawData unchanged when displayExternalReferences is false', async () => {
    const { parseResult } = await loadOntologyFromContent(TASK_ASSIGNMENT_TTL, 'http://example.org/task-assignment.ttl');
    const rawData = parseResult.graphData;
    const refs = [{ url: 'http://example.org/project-mgmt', usePrefix: true, prefix: 'pm' }];
    const result = expandWithExternalRefs(rawData, parseResult.store, refs, {
      displayExternalReferences: false,
      externalNodeLayout: 'auto',
    });
    expect(result).toBe(rawData);
    expect(result.nodes.length).toBe(2);
    expect(result.edges.length).toBe(0);
  });

  it('returns rawData unchanged when externalRefs is empty', async () => {
    const { parseResult } = await loadOntologyFromContent(TASK_ASSIGNMENT_TTL, 'http://example.org/task-assignment.ttl');
    const rawData = parseResult.graphData;
    const result = expandWithExternalRefs(rawData, parseResult.store, [], {
      displayExternalReferences: true,
      externalNodeLayout: 'auto',
    });
    expect(result.nodes.length).toBe(2);
    expect(result.edges.length).toBe(0);
  });

  it('does not duplicate Layout->DrawingElement contains when rawData already has it (local type name)', async () => {
    const ttl = readFileSync(AEC_DRAWING_PATH, 'utf-8');
    const { graphData, store } = await parseTtlToGraph(ttl);
    const rawData = graphData;
    const layoutToDrawing = rawData.edges.filter(
      (e) => e.from === 'Layout' && e.to === 'DrawingElement' && (e.type === 'contains' || e.type.includes('contains'))
    );
    expect(layoutToDrawing.length).toBeGreaterThanOrEqual(1);
    const refs = [{ url: 'http://example.org/aec-drawing-ontology', usePrefix: true, prefix: '' }];
    const result = expandWithExternalRefs(rawData, store, refs, {
      displayExternalReferences: true,
      externalNodeLayout: 'auto',
    });
    const resultLayoutToDrawing = result.edges.filter(
      (e) => e.from === 'Layout' && e.to === 'DrawingElement' && (e.type === 'contains' || e.type.includes('contains'))
    );
    expect(resultLayoutToDrawing.length).toBe(1);
  });

  it('adds external class nodes and edges when displayExternalReferences is true', async () => {
    const { parseResult } = await loadOntologyFromContent(TASK_ASSIGNMENT_TTL, 'http://example.org/task-assignment.ttl');
    const rawData = parseResult.graphData;
    const refs = [{ url: 'http://example.org/project-mgmt', usePrefix: true, prefix: 'pm' }];
    const result = expandWithExternalRefs(rawData, parseResult.store, refs, {
      displayExternalReferences: true,
      externalNodeLayout: 'auto',
    });
    expect(result.nodes.length).toBeGreaterThan(2);
    const externalNodes = result.nodes.filter((n) => (n as { isExternal?: boolean }).isExternal);
    expect(externalNodes.length).toBe(3);
    const uris = externalNodes.map((n) => n.id).sort();
    expect(uris).toContain('http://example.org/project-mgmt#Person');
    expect(uris).toContain('http://example.org/project-mgmt#Project');
    expect(uris).toContain('http://example.org/project-mgmt#Organisation');
    externalNodes.forEach((n) => {
      expect((n as { externalOntologyUrl?: string }).externalOntologyUrl).toBe('http://example.org/project-mgmt');
    });
    const edgesToExternal = result.edges.filter(
      (e) => e.from === 'Task' && (e.to.startsWith('http://') || e.to === 'Person' || e.to === 'Project')
    );
    expect(edgesToExternal.length).toBeGreaterThanOrEqual(2);
    const personOrgEdge = result.edges.find(
      (e) => e.from === 'http://example.org/project-mgmt#Person' && e.to === 'http://example.org/project-mgmt#Organisation'
    );
    expect(personOrgEdge).toBeDefined();
  });
});

describe('isExternalNodeId', () => {
  it('returns false for __dataprop nodes', () => {
    const rawData = { nodes: [{ id: 'A', label: 'A', labellableRoot: null }], edges: [] };
    expect(isExternalNodeId('__dataprop__A__foo', rawData)).toBe(false);
  });

  it('returns false when node id is in rawData', () => {
    const rawData = { nodes: [{ id: 'http://example.org/ns#Local', label: 'Local', labellableRoot: null }], edges: [] };
    expect(isExternalNodeId('http://example.org/ns#Local', rawData)).toBe(false);
  });

  it('returns true for full URI not in rawData', () => {
    const rawData = { nodes: [{ id: 'Task', label: 'Task', labellableRoot: null }], edges: [] };
    expect(isExternalNodeId('http://example.org/project-mgmt#Person', rawData)).toBe(true);
  });
});
