import { describe, it, expect } from 'vitest';
import { DataFactory } from 'n3';
import { parseRdfToGraph, storeToTurtle } from '../../src/parser';
import { 
  setExampleImageUrisForClass, 
  getExampleImageUrisForClass,
  ensureExampleImageAnnotationProperty 
} from '../../src/lib/exampleImageStore';
import { applyNodeFormToStore } from '../../src/ui/nodeModalForm';
import type { GraphNode } from '../../src/types';

describe('Example Image Persistence', () => {
  it('should persist example images to TTL after adding them to a class', async () => {
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test Class" .
`;

    // Parse the ontology
    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store, graphData } = parseResult;

    // Find the class node (node IDs are lowercase)
    const testClassNode = graphData.nodes.find((n) => n.label === 'Test Class');
    expect(testClassNode).toBeDefined();
    if (!testClassNode) return; // Type guard
    
    const nodeId = testClassNode.id; // Use the actual node ID from the parsed graph

    // Get the base IRI (should use class namespace, not ontology base)
    const { getClassNamespace, getMainOntologyBase } = await import('../../src/parser');
    const classNs = getClassNamespace(store);
    const mainBase = getMainOntologyBase(store);
    const baseIri = classNs ?? mainBase ?? 'http://example.org/test#';
    
    // Initially, the class should have no example images
    const initialUris = getExampleImageUrisForClass(store, nodeId, baseIri);
    expect(initialUris).toEqual([]);
    expect(testClassNode?.exampleImages).toBeUndefined();

    // Add an example image
    const exampleImageUri = 'img/test-image.png';
    const success = setExampleImageUrisForClass(store, nodeId, [exampleImageUri], baseIri);
    expect(success).toBe(true);

    // Verify the image is in the store
    const urisAfterSet = getExampleImageUrisForClass(store, nodeId, baseIri);
    expect(urisAfterSet).toEqual([exampleImageUri]);

    // Serialize to TTL and verify the image is persisted
    const serializedTtl = await storeToTurtle(store);
    // Verify the exampleImage quads are in the serialized TTL
    expect(serializedTtl).toContain('exampleImage');
    expect(serializedTtl).toContain(exampleImageUri);
    expect(serializedTtl).toContain('TestClass');
    
    // Verify the quad exists in the store before serialization
    const quadsBeforeSave = store.getQuads(
      DataFactory.namedNode('http://example.org/test#TestClass'),
      DataFactory.namedNode('http://example.org/test#exampleImage'),
      null,
      null
    );
    expect(quadsBeforeSave.length).toBeGreaterThan(0);
    expect(quadsBeforeSave.some(q => q.object.value === exampleImageUri)).toBe(true);

    // Parse again and verify the image is still there
    const reparseResult = await parseRdfToGraph(serializedTtl, { path: 'test.ttl' });
    const reparseNode = reparseResult.graphData.nodes.find((n) => n.label === 'Test Class');
    expect(reparseNode).toBeDefined();
    if (!reparseNode) return;
    
    // Get the base IRI for the reparsed store
    const { getClassNamespace: getClassNs2, getMainOntologyBase: getMainBase2 } = await import('../../src/parser');
    const classNs2 = getClassNs2(reparseResult.store);
    const mainBase2 = getMainBase2(reparseResult.store);
    const baseIri2 = classNs2 ?? mainBase2 ?? 'http://example.org/test#';
    
    const reparseUris = getExampleImageUrisForClass(reparseResult.store, reparseNode.id, baseIri2);
    console.log('[TEST] Reparsed URIs:', reparseUris);
    console.log('[TEST] Reparse base IRI:', baseIri2);
    console.log('[TEST] Original base IRI:', baseIri);
    expect(reparseUris).toEqual([exampleImageUri]);
  });

  it('should persist example images when using applyNodeFormToStore', async () => {
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology .

:MyClass rdf:type owl:Class ;
    rdfs:label "My Class" .
`;

    // Parse the ontology
    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store, graphData } = parseResult;

    // Find the class node (node IDs are lowercase)
    const myClassNode = graphData.nodes.find((n) => n.label === 'My Class');
    expect(myClassNode).toBeDefined();
    if (!myClassNode) return; // Type guard
    
    const nodeId = myClassNode.id; // Use the actual node ID from the parsed graph

    // Get the base IRI
    const { getClassNamespace, getMainOntologyBase } = await import('../../src/parser');
    const classNs = getClassNamespace(store);
    const mainBase = getMainOntologyBase(store);
    const baseIri = classNs ?? mainBase ?? 'http://example.org/test#';

    // Apply form data with example images (simulating what confirmRename does)
    const formData = {
      comment: 'Test comment',
      exampleImageUris: ['img/example1.png', 'img/example2.png'],
      annotationValues: {},
      dataPropertyRestrictions: [],
    };

    applyNodeFormToStore(nodeId, formData, store, myClassNode as GraphNode, baseIri, []);

    // Verify the images are in the store
    const uris = getExampleImageUrisForClass(store, nodeId, baseIri);
    expect(uris).toEqual(['img/example1.png', 'img/example2.png']);
    expect(myClassNode?.exampleImages).toEqual(['img/example1.png', 'img/example2.png']);

    // Serialize to TTL and verify persistence
    const serializedTtl = await storeToTurtle(store);
    expect(serializedTtl).toContain('exampleImage');
    expect(serializedTtl).toContain('img/example1.png');
    expect(serializedTtl).toContain('img/example2.png');

    // Parse again and verify the images are still there
    const reparseResult = await parseRdfToGraph(serializedTtl, { path: 'test.ttl' });
    const reparseNode = reparseResult.graphData.nodes.find((n) => n.label === 'My Class');
    expect(reparseNode).toBeDefined();
    if (!reparseNode) return;
    const reparseUris = getExampleImageUrisForClass(reparseResult.store, reparseNode.id, baseIri);
    expect(reparseUris).toEqual(['img/example1.png', 'img/example2.png']);
  });

  it('should handle removing all example images', async () => {
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology .

:ClassWithImages rdf:type owl:Class ;
    rdfs:label "Class With Images" ;
    :exampleImage <img/existing.png> .
`;

    // Parse the ontology
    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store, graphData } = parseResult;

    // Find the class node (node IDs are lowercase)
    const classNode = graphData.nodes.find((n) => n.label === 'Class With Images');
    expect(classNode).toBeDefined();
    if (!classNode) return; // Type guard
    
    const nodeId = classNode.id; // Use the actual node ID from the parsed graph

    // Get the base IRI
    const { getClassNamespace, getMainOntologyBase } = await import('../../src/parser');
    const classNs = getClassNamespace(store);
    const mainBase = getMainOntologyBase(store);
    const baseIri = classNs ?? mainBase ?? 'http://example.org/test#';

    // Verify initial image exists
    const initialUris = getExampleImageUrisForClass(store, nodeId, baseIri);
    expect(initialUris).toContain('img/existing.png');

    // Remove all images using applyNodeFormToStore
    const formData = {
      comment: '',
      exampleImageUris: [], // Empty array should remove all images
      annotationValues: {},
      dataPropertyRestrictions: [],
    };

    applyNodeFormToStore(nodeId, formData, store, classNode as GraphNode, baseIri, []);

    // Verify images are removed
    const urisAfterRemove = getExampleImageUrisForClass(store, nodeId, baseIri);
    expect(urisAfterRemove).toEqual([]);
    expect(classNode?.exampleImages).toBeUndefined();

    // Serialize to TTL and verify no exampleImage quads remain
    const serializedTtl = await storeToTurtle(store);
    // The class should not have exampleImage quads anymore
    const lines = serializedTtl.split('\n');
    const classLines = lines.filter((line) => line.includes('ClassWithImages'));
    const hasExampleImage = classLines.some((line) => line.includes('exampleImage'));
    expect(hasExampleImage).toBe(false);
  });
});
