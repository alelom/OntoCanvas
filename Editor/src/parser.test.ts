import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import {
  parseTtlToGraph,
  updateLabelInStore,
  storeToTurtle,
  extractLocalName,
  addEdgeToStore,
  addNodeToStore,
  removeEdgeFromStore,
  removeNodeFromStore,
} from './parser';
import type { GraphData } from './types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ONTOLOGY_PATH = resolve(__dirname, '../../ontology/aec_drawing_ontology.ttl');

function loadOntologyAsString(): string {
  return readFileSync(ONTOLOGY_PATH, 'utf-8');
}

/** Normalize graph data for comparison (sort by id). */
function normalizeGraphData(data: GraphData): GraphData {
  const nodes = [...data.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...data.edges].sort(
    (a, b) =>
      a.from.localeCompare(b.from) ||
      a.to.localeCompare(b.to) ||
      a.type.localeCompare(b.type)
  );
  return { nodes, edges };
}

/** Assert two graph data objects are equivalent. */
function expectGraphDataEqual(actual: GraphData, expected: GraphData): void {
  const a = normalizeGraphData(actual);
  const b = normalizeGraphData(expected);
  expect(a.nodes).toHaveLength(b.nodes.length);
  expect(a.edges).toHaveLength(b.edges.length);
  for (let i = 0; i < a.nodes.length; i++) {
    expect(a.nodes[i].id).toBe(b.nodes[i].id);
    expect(a.nodes[i].label).toBe(b.nodes[i].label);
    expect(a.nodes[i].labellableRoot).toBe(b.nodes[i].labellableRoot);
  }
  for (let i = 0; i < a.edges.length; i++) {
    expect(a.edges[i].from).toBe(b.edges[i].from);
    expect(a.edges[i].to).toBe(b.edges[i].to);
    expect(a.edges[i].type).toBe(b.edges[i].type);
  }
}

describe('extractLocalName', () => {
  it('extracts local name from hash URI', () => {
    expect(extractLocalName('http://example.org/ont#FacadeCladding')).toBe('FacadeCladding');
  });
  it('extracts local name from path URI', () => {
    expect(extractLocalName('http://example.org/ont/FacadeCladding')).toBe('FacadeCladding');
  });
});

describe('parseTtlToGraph (load)', () => {
  it('parses the AEC ontology file', async () => {
    const ttl = loadOntologyAsString();
    const { graphData, store } = await parseTtlToGraph(ttl);

    expect(graphData.nodes.length).toBeGreaterThan(100);
    expect(graphData.edges.length).toBeGreaterThan(100);

    const nodeIds = new Set(graphData.nodes.map((n) => n.id));
    expect(nodeIds.has('FacadeCladding')).toBe(true);
    expect(nodeIds.has('DrawingElement')).toBe(true);
    expect(nodeIds.has('Metadata')).toBe(true);

    const facadeCladding = graphData.nodes.find((n) => n.id === 'FacadeCladding');
    expect(facadeCladding).toBeDefined();
    expect(facadeCladding!.label).toBe('Facade cladding');
    expect(facadeCladding!.labellableRoot).toBe(false);

    const note = graphData.nodes.find((n) => n.id === 'Note');
    expect(note).toBeDefined();
    expect(note!.labellableRoot).toBe(true);

    const metadata = graphData.nodes.find((n) => n.id === 'Metadata');
    expect(metadata).toBeDefined();
    expect(metadata!.labellableRoot).toBe(false);

    expect(store).toBeDefined();
  });

  it('produces same result from file content vs raw string (consistency)', async () => {
    const ttl = loadOntologyAsString();
    const result1 = await parseTtlToGraph(ttl);
    const result2 = await parseTtlToGraph(ttl);

    expectGraphDataEqual(result1.graphData, result2.graphData);
  });

  it('extracts subClassOf edges', async () => {
    const ttl = loadOntologyAsString();
    const { graphData } = await parseTtlToGraph(ttl);

    const subClassEdges = graphData.edges.filter((e) => e.type === 'subClassOf');
    expect(subClassEdges.length).toBeGreaterThan(0);

    const facadeToDrawing = graphData.edges.find(
      (e) => e.from === 'FacadeSystem' && e.to === 'DrawingElement' && e.type === 'subClassOf'
    );
    expect(facadeToDrawing).toBeDefined();
  });

  it('extracts contains edges', async () => {
    const ttl = loadOntologyAsString();
    const { graphData } = await parseTtlToGraph(ttl);

    const containsEdges = graphData.edges.filter((e) => e.type === 'contains');
    expect(containsEdges.length).toBeGreaterThan(0);
  });
});

describe('updateLabelInStore (edit)', () => {
  it('updates label for existing class', async () => {
    const ttl = loadOntologyAsString();
    const { graphData, store } = await parseTtlToGraph(ttl);

    const updated = updateLabelInStore(store, 'FacadeCladding', 'Facade Cladding Updated');
    expect(updated).toBe(true);

    const result = await parseTtlToGraph(await storeToTurtle(store));
    const node = result.graphData.nodes.find((n) => n.id === 'FacadeCladding');
    expect(node).toBeDefined();
    expect(node!.label).toBe('Facade Cladding Updated');
  });

  it('returns false for non-existent class', async () => {
    const ttl = loadOntologyAsString();
    const { store } = await parseTtlToGraph(ttl);

    const updated = updateLabelInStore(store, 'NonExistentClass', 'New Label');
    expect(updated).toBe(false);
  });

  it('adds label for class without rdfs:label', async () => {
    const minimalTtl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:TestClass rdf:type owl:Class .
`;
    const { store } = await parseTtlToGraph(minimalTtl);
    const updated = updateLabelInStore(store, 'TestClass', 'Test Label');
    expect(updated).toBe(true);

    const result = await parseTtlToGraph(await storeToTurtle(store));
    const node = result.graphData.nodes.find((n) => n.id === 'TestClass');
    expect(node).toBeDefined();
    expect(node!.label).toBe('Test Label');
  });

  it('adds and removes contains edge', async () => {
    const ttl = loadOntologyAsString();
    const { store } = await parseTtlToGraph(ttl);
    const ok = addEdgeToStore(store, 'Layout', 'FacadeCladding', 'contains');
    expect(ok).toBe(true);
    const { graphData } = await parseTtlToGraph(await storeToTurtle(store));
    const containsEdge = graphData.edges.find(
      (e) => e.from === 'Layout' && e.to === 'FacadeCladding' && e.type === 'contains'
    );
    expect(containsEdge).toBeDefined();
    const removeOk = removeEdgeFromStore(store, 'Layout', 'FacadeCladding', 'contains');
    expect(removeOk).toBe(true);
    const afterRemove = await parseTtlToGraph(await storeToTurtle(store));
    const gone = afterRemove.graphData.edges.find(
      (e) => e.from === 'Layout' && e.to === 'FacadeCladding' && e.type === 'contains'
    );
    expect(gone).toBeUndefined();
  });

  it('adds contains edge', async () => {
    const ttl = loadOntologyAsString();
    const { store } = await parseTtlToGraph(ttl);
    const ok = addEdgeToStore(store, 'Layout', 'FacadeCladding', 'contains');
    expect(ok).toBe(true);
    const { graphData } = await parseTtlToGraph(await storeToTurtle(store));
    const containsEdge = graphData.edges.find(
      (e) => e.from === 'Layout' && e.to === 'FacadeCladding' && e.type === 'contains'
    );
    expect(containsEdge).toBeDefined();
  });

  it('adds edge with cardinality and round-trips', async () => {
    const ttl = loadOntologyAsString();
    const { store } = await parseTtlToGraph(ttl);
    addNodeToStore(store, 'CardinalityTestContainer');
    const ok = addEdgeToStore(store, 'CardinalityTestContainer', 'Layout', 'contains', {
      minCardinality: 0,
      maxCardinality: 3,
    });
    expect(ok).toBe(true);
    const { graphData } = await parseTtlToGraph(await storeToTurtle(store));
    const containsEdge = graphData.edges.find(
      (e) => e.from === 'CardinalityTestContainer' && e.to === 'Layout' && e.type === 'contains'
    );
    expect(containsEdge).toBeDefined();
    expect(containsEdge!.minCardinality).toBe(0);
    expect(containsEdge!.maxCardinality).toBe(3);
  });

  it('adds and removes hasFunction edge (non-partOf/contains restriction)', async () => {
    const ttl = loadOntologyAsString();
    const { store } = await parseTtlToGraph(ttl);
    const ok = addEdgeToStore(store, 'FacadeCladding', 'Function', 'hasFunction');
    expect(ok).toBe(true);
    const { graphData } = await parseTtlToGraph(await storeToTurtle(store));
    const edge = graphData.edges.find(
      (e) => e.from === 'FacadeCladding' && e.to === 'Function' && e.type === 'hasFunction'
    );
    expect(edge).toBeDefined();
    const removeOk = removeEdgeFromStore(store, 'FacadeCladding', 'Function', 'hasFunction');
    expect(removeOk).toBe(true);
    const afterRemove = await parseTtlToGraph(await storeToTurtle(store));
    const gone = afterRemove.graphData.edges.find(
      (e) => e.from === 'FacadeCladding' && e.to === 'Function' && e.type === 'hasFunction'
    );
    expect(gone).toBeUndefined();
  });

  it('delete order: remove edges before nodes so restriction-based edges can be found', async () => {
    const ttl = loadOntologyAsString();
    const { store } = await parseTtlToGraph(ttl);
    addEdgeToStore(store, 'Layout', 'FacadeCladding', 'contains');
    const before = await parseTtlToGraph(await storeToTurtle(store));
    expect(before.graphData.edges.some((e) => e.from === 'Layout' && e.to === 'FacadeCladding' && e.type === 'contains')).toBe(true);

    // Wrong order: remove node first, then edge. removeEdgeFromStore fails because the
    // restriction blank is no longer reachable from Layout's subClassOf quads.
    removeNodeFromStore(store, 'Layout');
    const removeEdgeFails = removeEdgeFromStore(store, 'Layout', 'FacadeCladding', 'contains');
    expect(removeEdgeFails).toBe(false);

    // Correct order: reload, remove edge first, then node. Both succeed.
    const { store: store2 } = await parseTtlToGraph(ttl);
    addEdgeToStore(store2, 'Layout', 'FacadeCladding', 'contains');
    const edgeOk = removeEdgeFromStore(store2, 'Layout', 'FacadeCladding', 'contains');
    expect(edgeOk).toBe(true);
    const nodeOk = removeNodeFromStore(store2, 'Layout');
    expect(nodeOk).toBe(true);
    const after = await parseTtlToGraph(await storeToTurtle(store2));
    expect(after.graphData.nodes.some((n) => n.id === 'FacadeCladding')).toBe(true);
    expect(after.graphData.nodes.some((n) => n.id === 'Layout')).toBe(false);
    expect(after.graphData.edges.some((e) => e.from === 'Layout' && e.to === 'FacadeCladding' && e.type === 'contains')).toBe(false);
  });
});

describe('storeToTurtle (save)', () => {
  it('produces valid Turtle string', async () => {
    const ttl = loadOntologyAsString();
    const { store } = await parseTtlToGraph(ttl);

    const output = await storeToTurtle(store);
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(100);
    expect(output).toMatch(/owl#Class|owl:Class/);
    expect(output).toMatch(/Ontology|Class/);
  });

  it('output can be parsed back', async () => {
    const ttl = loadOntologyAsString();
    const { store } = await parseTtlToGraph(ttl);
    const output = await storeToTurtle(store);

    const parsed = await parseTtlToGraph(output);
    expect(parsed.graphData.nodes.length).toBeGreaterThan(0);
    expect(parsed.graphData.edges.length).toBeGreaterThan(0);
  });

  it('output includes section dividers and spacing', async () => {
    const ttl = loadOntologyAsString();
    const { store } = await parseTtlToGraph(ttl);
    const output = await storeToTurtle(store);

    const divider = '#################################################################';
    expect(output).toContain(divider);
    expect(output).toMatch(/#\s+Annotation properties/);
    expect(output).toMatch(/#\s+Object Properties/);
    expect(output).toMatch(/#\s+Classes/);
  });

  it('output uses :prefix style for ontology IRIs', async () => {
    const ttl = loadOntologyAsString();
    const { store } = await parseTtlToGraph(ttl);
    const output = await storeToTurtle(store);

    expect(output).toMatch(/@prefix : <http:\/\/example\.org\/aec-drawing-ontology#>?\s*\./);
    expect(output).toMatch(/:Ontology|:Layout|:FacadeComponent/);
  });

  it('output does not repeat section dividers', async () => {
    const ttl = loadOntologyAsString();
    const { store } = await parseTtlToGraph(ttl);
    const output = await storeToTurtle(store);

    const annotationPropsCount = (output.match(/#\s+Annotation properties/g) || []).length;
    expect(annotationPropsCount).toBe(1);
  });

  it('output uses explicit rdf:type and boolean literals (preserves style)', async () => {
    const ttl = loadOntologyAsString();
    const { store } = await parseTtlToGraph(ttl);
    const output = await storeToTurtle(store);

    expect(output).toMatch(/rdf:type/);
    expect(output).not.toMatch(/\b a (owl|rdf|rdfs|xsd|xml):/);
    expect(output).toMatch(/"false"\^\^xsd:boolean/);
    expect(output).not.toMatch(/\blabellableRoot false[.;\s]/);
  });

  it('output inlines blank nodes (rdfs:subClassOf uses [ ... ] not _:n3-X)', async () => {
    const ttl = loadOntologyAsString();
    const { store } = await parseTtlToGraph(ttl);
    const output = await storeToTurtle(store);

    expect(output).not.toMatch(/_\s*:\s*n3-\d/);
    expect(output).toMatch(/\[\s*rdf:type\s+owl:Restriction/);
  });
});

describe('round-trip: load -> save -> load', () => {
  it('produces equivalent graph data', async () => {
    const ttl = loadOntologyAsString();
    const { graphData: original, store } = await parseTtlToGraph(ttl);

    const saved = await storeToTurtle(store);
    const { graphData: reloaded } = await parseTtlToGraph(saved);

    expectGraphDataEqual(reloaded, original);
  });

  it('produces equivalent graph data after edit', async () => {
    const ttl = loadOntologyAsString();
    const { graphData: original, store } = await parseTtlToGraph(ttl);

    updateLabelInStore(store, 'FacadeCladding', 'Facade cladding (edited)');

    const saved = await storeToTurtle(store);
    const { graphData: reloaded } = await parseTtlToGraph(saved);

    const expectedNodes = original.nodes.map((n) =>
      n.id === 'FacadeCladding' ? { ...n, label: 'Facade cladding (edited)' } : n
    );
    const expected = { nodes: expectedNodes, edges: original.edges };
    expectGraphDataEqual(reloaded, expected);
  });
});

describe('default vs file load consistency', () => {
  it('identical string content produces identical graph (simulates default vs file)', async () => {
    const ttl = loadOntologyAsString();
    const result1 = await parseTtlToGraph(ttl);
    const result2 = await parseTtlToGraph(ttl);

    expectGraphDataEqual(result1.graphData, result2.graphData);
  });

  it('content with normalized line endings produces same graph', async () => {
    const ttl = loadOntologyAsString();
    const ttlLF = ttl.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const ttlCRLF = ttlLF.replace(/\n/g, '\r\n');

    const resultLF = await parseTtlToGraph(ttlLF);
    const resultCRLF = await parseTtlToGraph(ttlCRLF);

    expectGraphDataEqual(resultLF.graphData, resultCRLF.graphData);
  });

  it('file content produces expected node and edge counts', async () => {
    const ttl = loadOntologyAsString();
    const { graphData } = await parseTtlToGraph(ttl);

    expect(graphData.nodes.length).toBeGreaterThan(170);
    expect(graphData.edges.length).toBeGreaterThanOrEqual(163);
  });

  it('minimal edit preserves all other nodes and edges', async () => {
    const ttl = loadOntologyAsString();
    const { graphData: original, store } = await parseTtlToGraph(ttl);

    updateLabelInStore(store, 'Note', 'Note (edited)');

    const saved = await storeToTurtle(store);
    const { graphData: reloaded } = await parseTtlToGraph(saved);

    expect(reloaded.nodes.length).toBe(original.nodes.length);
    expect(reloaded.edges.length).toBe(original.edges.length);

    for (const n of reloaded.nodes) {
      const o = original.nodes.find((x) => x.id === n.id);
      expect(o).toBeDefined();
      if (n.id === 'Note') {
        expect(n.label).toBe('Note (edited)');
      } else {
        expect(n.label).toBe(o!.label);
        expect(n.labellableRoot).toBe(o!.labellableRoot);
      }
    }
    for (const e of reloaded.edges) {
      const o = original.edges.find(
        (x) => x.from === e.from && x.to === e.to && x.type === e.type
      );
      expect(o).toBeDefined();
    }
  });

  it('parses labellableRoot for multiple classes', async () => {
    const ttl = loadOntologyAsString();
    const { graphData } = await parseTtlToGraph(ttl);

    const labellableTrue = graphData.nodes.filter((n) => n.labellableRoot === true);
    const labellableFalse = graphData.nodes.filter((n) => n.labellableRoot === false);

    expect(labellableTrue.length).toBeGreaterThan(0);
    expect(labellableFalse.length).toBeGreaterThan(0);
  });

  it('detects labellableRoot as boolean annotation property (rdfs:range xsd:boolean)', async () => {
    const ttl = loadOntologyAsString();
    const { annotationProperties } = await parseTtlToGraph(ttl);

    const labellableRoot = annotationProperties.find((ap) => ap.name === 'labellableRoot');
    expect(labellableRoot).toBeDefined();
    expect(labellableRoot!.isBoolean).toBe(true);
  });

  it('round-trip preserves labellableRoot as boolean (saved file re-parses correctly)', async () => {
    const ttl = loadOntologyAsString();
    const { store } = await parseTtlToGraph(ttl);
    const saved = await storeToTurtle(store);
    const { annotationProperties } = await parseTtlToGraph(saved);

    const labellableRoot = annotationProperties.find((ap) => ap.name === 'labellableRoot');
    expect(labellableRoot).toBeDefined();
    expect(labellableRoot!.isBoolean).toBe(true);
  });

  it('round-trip preserves all nodes and edges', async () => {
    const ttl = loadOntologyAsString();
    const { graphData } = await parseTtlToGraph(ttl);
    const { store } = await parseTtlToGraph(ttl);

    const saved = await storeToTurtle(store);
    const { graphData: reloaded } = await parseTtlToGraph(saved);

    expect(reloaded.nodes.length).toBe(graphData.nodes.length);
    expect(reloaded.edges.length).toBe(graphData.edges.length);

    const originalIds = new Set(graphData.nodes.map((n) => n.id));
    const reloadedIds = new Set(reloaded.nodes.map((n) => n.id));
    expect(reloadedIds).toEqual(originalIds);

    const originalEdgeKeys = new Set(
      graphData.edges.map((e) => `${e.from}:${e.to}:${e.type}`)
    );
    const reloadedEdgeKeys = new Set(
      reloaded.edges.map((e) => `${e.from}:${e.to}:${e.type}`)
    );
    expect(reloadedEdgeKeys).toEqual(originalEdgeKeys);
  });
});
