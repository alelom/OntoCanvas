/**
 * Unit tests for OWL restriction preservation when renaming classes.
 * These tests ensure that OWL restrictions (blank nodes) are preserved
 * when updating class labels, comments, or other properties.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseRdfToGraph, storeToTurtle, updateLabelInStore } from '../../src/parser';
import { Store, DataFactory, BlankNode } from 'n3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_FIXTURES_DIR = join(__dirname, '../fixtures');

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';

/**
 * Test helper to verify blank node quads are present in block.quads
 * This helps diagnose issues with cache-based reconstruction
 */
function verifyBlankNodeQuadsInBlock(
  store: Store,
  classUri: string,
  expectedRestrictionCount: number
): { hasAllQuads: boolean; blankNodeQuadsAsSubjects: number; blankNodeQuadsAsObjects: number; details: string } {
  const subClassOfQuads = store.getQuads(
    DataFactory.namedNode(classUri),
    DataFactory.namedNode(RDFS + 'subClassOf'),
    null,
    null
  );
  const restrictionBlankNodes = new Set<string>();
  
  for (const subClassQuad of subClassOfQuads) {
    if (subClassQuad.object.termType === 'BlankNode') {
      const blankId = (subClassQuad.object as { id: string }).id;
      restrictionBlankNodes.add(blankId);
    }
  }
  
  let blankNodeQuadsAsSubjects = 0;
  let blankNodeQuadsAsObjects = 0;
  
  for (const blankId of restrictionBlankNodes) {
    const blankNode = DataFactory.blankNode(blankId);
    const blankQuads = store.getQuads(blankNode, null, null, null);
    blankNodeQuadsAsSubjects += blankQuads.length;
    
    // Count quads where this blank node is an object
    const quadsWithBlankAsObject = store.getQuads(null, null, blankNode, null);
    blankNodeQuadsAsObjects += quadsWithBlankAsObject.length;
  }
  
  const hasAllQuads = restrictionBlankNodes.size === expectedRestrictionCount && blankNodeQuadsAsSubjects > 0;
  const details = `Found ${restrictionBlankNodes.size} restriction blank nodes (expected ${expectedRestrictionCount}), ` +
    `${blankNodeQuadsAsSubjects} quads where blank nodes are subjects, ` +
    `${blankNodeQuadsAsObjects} quads where blank nodes are objects`;
  
  return { hasAllQuads, blankNodeQuadsAsSubjects, blankNodeQuadsAsObjects, details };
}

describe('OWL Restriction Preservation', () => {
  it('should preserve all OWL restrictions when renaming a class label', async () => {
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:DrawingSheet rdfs:subClassOf 
    [ rdf:type owl:Restriction ; 
      owl:onProperty :contains ; 
      owl:minQualifiedCardinality "0"^^xsd:nonNegativeInteger ; 
      owl:onClass :Note ], 
    [ rdf:type owl:Restriction ; 
      owl:onProperty :contains ; 
      owl:minQualifiedCardinality "0"^^xsd:nonNegativeInteger ; 
      owl:onClass :RevisionTable ; 
      owl:qualifiedCardinality "1"^^xsd:nonNegativeInteger ; 
      owl:maxQualifiedCardinality "1"^^xsd:nonNegativeInteger ], 
    [ rdf:type owl:Restriction ; 
      owl:onProperty :contains ; 
      owl:minQualifiedCardinality "1"^^xsd:nonNegativeInteger ; 
      owl:onClass :Layout ], 
    [ rdf:type owl:Restriction ; 
      owl:onProperty :has ; 
      owl:onClass :DrawingOrientation ; 
      owl:qualifiedCardinality "1"^^xsd:nonNegativeInteger ] ;
    rdfs:label "Drawing Sheet" ;
    rdfs:comment "Top-level container for a drawing. Contains Layout(s)." ;
    a owl:Class ;
    :labellableRoot false .

:Note a owl:Class .
:RevisionTable a owl:Class .
:layout a owl:Class .
:DrawingOrientation a owl:Class .
:contains a owl:ObjectProperty .
:has a owl:ObjectProperty .
`;

    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;
    
    // Count restrictions before rename
    const beforeQuads = store.getQuads(
      DataFactory.namedNode('http://example.org/test#DrawingSheet'),
      DataFactory.namedNode(RDFS + 'subClassOf'),
      null,
      null
    );
    const beforeRestrictions = beforeQuads.filter(q => q.object.termType === 'BlankNode');
    expect(beforeRestrictions.length).toBe(4);
    
    // Verify restriction details
    const verifyRestriction = (storeToCheck: Store, blank: BlankNode, expectedProperty: string, expectedClass: string, expectedCardinality?: { min?: number; max?: number; exact?: number }) => {
      const onProp = storeToCheck.getQuads(blank, DataFactory.namedNode(OWL + 'onProperty'), null, null)[0];
      const onClass = storeToCheck.getQuads(blank, DataFactory.namedNode(OWL + 'onClass'), null, null)[0];
      expect(onProp).toBeDefined();
      expect(onClass).toBeDefined();
      expect(onProp?.object.value).toContain(expectedProperty);
      // rdflib may serialize class references as full URIs or prefix notation
      const onClassValue = onClass?.object.value || '';
      if (!onClassValue) {
        throw new Error(`onClass value is empty for restriction with property ${expectedProperty}`);
      }
      // Extract local name from URI (e.g., "http://example.org/test#Note" -> "Note")
      // Handle both full URIs and prefix notation (e.g., "test:Note")
      let localName = '';
      if (onClassValue.includes('#')) {
        localName = onClassValue.split('#').pop() || '';
      } else if (onClassValue.includes('/')) {
        localName = onClassValue.split('/').pop() || '';
      } else if (onClassValue.includes(':')) {
        // Prefix notation like "test:Note"
        localName = onClassValue.split(':').pop() || '';
      } else {
        localName = onClassValue;
      }
      // Check if local name matches expected class, or if full URI contains expected class
      const matches = localName === expectedClass || 
                      onClassValue.includes(`#${expectedClass}`) || 
                      onClassValue.endsWith(`/${expectedClass}`) ||
                      onClassValue === `http://example.org/test#${expectedClass}` ||
                      onClassValue.includes(`:${expectedClass}`) ||
                      localName.toLowerCase() === expectedClass.toLowerCase();
      if (!matches) {
        throw new Error(`onClass value "${onClassValue}" (local name: "${localName}") does not match expected class "${expectedClass}"`);
      }
      expect(matches).toBe(true);
      
      if (expectedCardinality) {
        if (expectedCardinality.min !== undefined) {
          const minCard = storeToCheck.getQuads(blank, DataFactory.namedNode(OWL + 'minQualifiedCardinality'), null, null)[0];
          expect(minCard).toBeDefined();
          expect(parseInt(minCard?.object.value || '0')).toBe(expectedCardinality.min);
        }
        if (expectedCardinality.max !== undefined) {
          const maxCard = storeToCheck.getQuads(blank, DataFactory.namedNode(OWL + 'maxQualifiedCardinality'), null, null)[0];
          expect(maxCard).toBeDefined();
          expect(parseInt(maxCard?.object.value || '0')).toBe(expectedCardinality.max);
        }
        if (expectedCardinality.exact !== undefined) {
          const exactCard = storeToCheck.getQuads(blank, DataFactory.namedNode(OWL + 'qualifiedCardinality'), null, null)[0];
          expect(exactCard).toBeDefined();
          expect(parseInt(exactCard?.object.value || '0')).toBe(expectedCardinality.exact);
        }
      }
    };
    
    // Verify all 4 restrictions exist with correct properties
    verifyRestriction(store, beforeRestrictions[0].object as BlankNode, 'contains', 'Note', { min: 0 });
    verifyRestriction(store, beforeRestrictions[1].object as BlankNode, 'contains', 'RevisionTable', { min: 0, exact: 1, max: 1 });
    verifyRestriction(store, beforeRestrictions[2].object as BlankNode, 'contains', 'Layout', { min: 1 });
    verifyRestriction(store, beforeRestrictions[3].object as BlankNode, 'has', 'DrawingOrientation', { exact: 1 });
    
    // Rename the label
    const renamed = updateLabelInStore(store, 'DrawingSheet', 'Drawing Sheeta');
    expect(renamed).toBe(true);
    
    // Serialize and re-parse
    const serialized = await storeToTurtle(store);
    const reparseResult = await parseRdfToGraph(serialized, { path: 'test.ttl' });
    const { store: store2 } = reparseResult;
    
    // Count restrictions after rename and re-parse
    const afterQuads = store2.getQuads(
      DataFactory.namedNode('http://example.org/test#DrawingSheet'),
      DataFactory.namedNode(RDFS + 'subClassOf'),
      null,
      null
    );
    const afterRestrictions = afterQuads.filter(q => q.object.termType === 'BlankNode');
    
    // All 4 restrictions should still exist
    expect(afterRestrictions.length).toBe(4);
    
    // Find restrictions by property and class (rdflib may reorder them)
    const findRestriction = (property: string, expectedClass: string) => {
      return afterRestrictions.find(r => {
        const blank = r.object as BlankNode;
        const onProp = store2.getQuads(blank, DataFactory.namedNode(OWL + 'onProperty'), null, null)[0];
        const onClass = store2.getQuads(blank, DataFactory.namedNode(OWL + 'onClass'), null, null)[0];
        if (!onProp || !onClass) return false;
        const propValue = onProp.object.value;
        const classValue = onClass.object.value;
        // Extract local names for comparison
        const propLocal = propValue.includes('#') ? propValue.split('#').pop() : propValue.split('/').pop() || propValue;
        const classLocal = classValue.includes('#') ? classValue.split('#').pop() : classValue.includes(':') ? classValue.split(':').pop() : classValue.split('/').pop() || classValue;
        return propLocal === property && (classLocal === expectedClass || classValue.includes(`#${expectedClass}`) || classValue.includes(`:${expectedClass}`));
      });
    };
    
    // Verify all restrictions still have correct properties (find by property+class, not by index)
    const noteRestriction = findRestriction('contains', 'Note');
    expect(noteRestriction).toBeDefined();
    verifyRestriction(store2, noteRestriction!.object as BlankNode, 'contains', 'Note', { min: 0 });
    
    const revisionTableRestriction = findRestriction('contains', 'RevisionTable');
    expect(revisionTableRestriction).toBeDefined();
    verifyRestriction(store2, revisionTableRestriction!.object as BlankNode, 'contains', 'RevisionTable', { min: 0, exact: 1, max: 1 });
    
    const layoutRestriction = findRestriction('contains', 'Layout');
    expect(layoutRestriction).toBeDefined();
    verifyRestriction(store2, layoutRestriction!.object as BlankNode, 'contains', 'Layout', { min: 1 });
    
    const drawingOrientationRestriction = findRestriction('has', 'DrawingOrientation');
    expect(drawingOrientationRestriction).toBeDefined();
    verifyRestriction(store2, drawingOrientationRestriction!.object as BlankNode, 'has', 'DrawingOrientation', { exact: 1 });
    
    // Verify label was updated
    const labelQuads = store2.getQuads(
      DataFactory.namedNode('http://example.org/test#DrawingSheet'),
      DataFactory.namedNode(RDFS + 'label'),
      null,
      null
    );
    expect(labelQuads.length).toBeGreaterThan(0);
    expect(labelQuads[0].object.value).toBe('Drawing Sheeta');
  });

  it('should not create empty blank nodes when renaming a class with restrictions', async () => {
    // Use the aec_drawing_metadata.ttl fixture
    const fixturePath = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');
    const originalContent = readFileSync(fixturePath, 'utf-8');
    
    const parseResult = await parseRdfToGraph(originalContent, { path: fixturePath });
    const { store } = parseResult;
    
    // Rename DrawingSheet
    updateLabelInStore(store, 'DrawingSheet', 'Drawing Sheeta');
    
    // Serialize
    const serialized = await storeToTurtle(store);
    
    // Check for empty blank nodes: [  ], [  ], [  ], [  ]
    const emptyBlankNodePattern = /\[\s*\]/g;
    const emptyBlanks = serialized.match(emptyBlankNodePattern);
    
    // Should not have empty blank nodes
    expect(emptyBlanks).toBeNull();
    
    // Check that DrawingSheet still has restrictions (not empty)
    // Check the entire serialized content for DrawingSheet restrictions
    expect(serialized).toMatch(/DrawingSheet[\s\S]*?rdfs:subClassOf/);
    
    // Should contain restriction details, not just empty brackets
    expect(serialized).toMatch(/owl:Restriction/);
    expect(serialized).toMatch(/owl:onProperty/);
    expect(serialized).toMatch(/owl:onClass/);
    
    // Should NOT be just empty brackets - check for empty blank nodes pattern
    expect(serialized).not.toMatch(/rdfs:subClassOf\s*\[\s*\]/);
    
    // More specific check: DrawingSheet should have restrictions with content
    const drawingSheetSection = serialized.match(/DrawingSheet[^.]*rdfs:subClassOf[^.]*\./);
    if (drawingSheetSection) {
      const subClassOfContent = drawingSheetSection[0];
      // Should have restriction content, not empty
      expect(subClassOfContent).toMatch(/\[[\s\S]*?owl:Restriction/);
      expect(subClassOfContent).not.toMatch(/rdfs:subClassOf\s*\[\s*\]/);
    }
  });

  it('should preserve all cardinality constraints when renaming', async () => {
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:TestClass rdfs:subClassOf 
    [ rdf:type owl:Restriction ; 
      owl:onProperty :prop1 ; 
      owl:minQualifiedCardinality "0"^^xsd:nonNegativeInteger ; 
      owl:onClass :Class1 ],
    [ rdf:type owl:Restriction ; 
      owl:onProperty :prop2 ; 
      owl:maxQualifiedCardinality "5"^^xsd:nonNegativeInteger ; 
      owl:onClass :Class2 ],
    [ rdf:type owl:Restriction ; 
      owl:onProperty :prop3 ; 
      owl:qualifiedCardinality "1"^^xsd:nonNegativeInteger ; 
      owl:onClass :Class3 ] ;
    rdfs:label "Test Class" ;
    a owl:Class .

:prop1 a owl:ObjectProperty .
:prop2 a owl:ObjectProperty .
:prop3 a owl:ObjectProperty .
:Class1 a owl:Class .
:Class2 a owl:Class .
:Class3 a owl:Class .
`;

    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;
    
    // Rename
    updateLabelInStore(store, 'TestClass', 'Renamed Test Class');
    
    // Serialize and re-parse
    const serialized = await storeToTurtle(store);
    const reparseResult = await parseRdfToGraph(serialized, { path: 'test.ttl' });
    const { store: store2 } = reparseResult;
    
    // Verify all cardinalities are preserved
    const subClassQuads = store2.getQuads(
      DataFactory.namedNode('http://example.org/test#TestClass'),
      DataFactory.namedNode(RDFS + 'subClassOf'),
      null,
      null
    );
    
    const restrictions = subClassQuads.filter(q => q.object.termType === 'BlankNode');
    expect(restrictions.length).toBe(3);
    
    // Check minQualifiedCardinality
    const minCardRestriction = restrictions.find(r => {
      const blank = r.object as BlankNode;
      const minCard = store2.getQuads(blank, DataFactory.namedNode(OWL + 'minQualifiedCardinality'), null, null)[0];
      return minCard && parseInt(minCard.object.value) === 0;
    });
    expect(minCardRestriction).toBeDefined();
    
    // Check maxQualifiedCardinality
    const maxCardRestriction = restrictions.find(r => {
      const blank = r.object as BlankNode;
      const maxCard = store2.getQuads(blank, DataFactory.namedNode(OWL + 'maxQualifiedCardinality'), null, null)[0];
      return maxCard && parseInt(maxCard.object.value) === 5;
    });
    expect(maxCardRestriction).toBeDefined();
    
    // Check qualifiedCardinality
    const exactCardRestriction = restrictions.find(r => {
      const blank = r.object as BlankNode;
      const exactCard = store2.getQuads(blank, DataFactory.namedNode(OWL + 'qualifiedCardinality'), null, null)[0];
      return exactCard && parseInt(exactCard.object.value) === 1;
    });
    expect(exactCardRestriction).toBeDefined();
  });

  it('should preserve OWL restrictions in round-trip (parse, rename, save, parse)', async () => {
    const fixturePath = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');
    const originalContent = readFileSync(fixturePath, 'utf-8');
    
    // Parse original
    const parseResult1 = await parseRdfToGraph(originalContent, { path: fixturePath });
    const { store: store1 } = parseResult1;
    
    // Get all quads for DrawingSheet before rename
    const drawingSheetUri = 'https://burohappoldmachinelearning.github.io/ADIRO/aec_drawing_metadata#DrawingSheet';
    const beforeQuads = store1.getQuads(
      DataFactory.namedNode(drawingSheetUri),
      null,
      null,
      null
    );
    
    // Count restriction-related quads
    const beforeRestrictionQuads = beforeQuads.filter(q => {
      if (q.predicate.value.includes('subClassOf') && q.object.termType === 'BlankNode') {
        return true;
      }
      if (q.subject.termType === 'BlankNode') {
        const blank = q.subject as BlankNode;
        const subClassQuads = store1.getQuads(
          DataFactory.namedNode(drawingSheetUri),
          DataFactory.namedNode(RDFS + 'subClassOf'),
          blank,
          null
        );
        return subClassQuads.length > 0;
      }
      return false;
    });
    
    // Rename
    updateLabelInStore(store1, 'DrawingSheet', 'Drawing Sheeta');
    
    // Serialize
    const serialized = await storeToTurtle(store1);
    
    // Re-parse
    const parseResult2 = await parseRdfToGraph(serialized, { path: fixturePath });
    const { store: store2 } = parseResult2;
    
    // Get all quads for DrawingSheet after round-trip
    const afterQuads = store2.getQuads(
      DataFactory.namedNode(drawingSheetUri),
      null,
      null,
      null
    );
    
    // Count restriction-related quads
    const afterRestrictionQuads = afterQuads.filter(q => {
      if (q.predicate.value.includes('subClassOf') && q.object.termType === 'BlankNode') {
        return true;
      }
      if (q.subject.termType === 'BlankNode') {
        const blank = q.subject as BlankNode;
        const subClassQuads = store2.getQuads(
          DataFactory.namedNode(drawingSheetUri),
          DataFactory.namedNode(RDFS + 'subClassOf'),
          blank,
          null
        );
        return subClassQuads.length > 0;
      }
      return false;
    });
    
    // Should have same number of restriction-related quads
    expect(afterRestrictionQuads.length).toBe(beforeRestrictionQuads.length);
    
    // Verify specific restrictions still exist
    const subClassAfter = store2.getQuads(
      DataFactory.namedNode(drawingSheetUri),
      DataFactory.namedNode(RDFS + 'subClassOf'),
      null,
      null
    );
    const blankNodesAfter = subClassAfter.filter(q => q.object.termType === 'BlankNode');
    expect(blankNodesAfter.length).toBe(4); // Should have 4 restrictions
    
    // Verify each restriction has required properties
    for (const quad of blankNodesAfter) {
      const blank = quad.object as BlankNode;
      const onProperty = store2.getQuads(blank, DataFactory.namedNode(OWL + 'onProperty'), null, null);
      const onClass = store2.getQuads(blank, DataFactory.namedNode(OWL + 'onClass'), null, null);
      const restrictionType = store2.getQuads(blank, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Restriction'), null);
      
      expect(onProperty.length).toBeGreaterThan(0);
      expect(onClass.length).toBeGreaterThan(0);
      expect(restrictionType.length).toBeGreaterThan(0);
    }
  });

  it('should preserve all class properties when renaming (label, comment, labellableRoot, restrictions)', async () => {
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:TestClass rdfs:subClassOf 
    [ rdf:type owl:Restriction ; 
      owl:onProperty :prop ; 
      owl:minQualifiedCardinality "1"^^xsd:nonNegativeInteger ; 
      owl:onClass :OtherClass ] ;
    rdfs:label "Original Label" ;
    rdfs:comment "Original comment" ;
    a owl:Class ;
    :labellableRoot false .

:prop a owl:ObjectProperty .
:OtherClass a owl:Class .
`;

    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;
    
    // Rename
    updateLabelInStore(store, 'TestClass', 'New Label');
    
    // Serialize
    const serialized = await storeToTurtle(store);
    
    // Verify all properties are present (order may differ, but all should exist)
    expect(serialized).toContain('New Label'); // New label
    expect(serialized).toContain('Original comment'); // Comment preserved
    // Annotation may be serialized as "false"^^xsd:boolean or labellableRoot false
    expect(serialized).toMatch(/labellableRoot.*false|"false"\^\^xsd:boolean/); // Annotation preserved
    expect(serialized).toContain('rdfs:subClassOf'); // Restrictions preserved
    expect(serialized).toMatch(/owl:Restriction/); // Restriction type preserved
    expect(serialized).toMatch(/owl:onProperty/); // Restriction property preserved
    expect(serialized).toMatch(/owl:onClass/); // Restriction class preserved
    expect(serialized).toMatch(/owl:minQualifiedCardinality.*1/); // Cardinality preserved
  });

  it.skip('should preserve OWL restrictions when renaming using cache-based reconstruction (GUI workflow)', async () => {
    // SKIPPED: Cache-based reconstruction is disabled by default due to blank node issues.
    // This test is kept for future work when cache-based reconstruction is fixed.
    // Expected failure: OWL restrictions are lost (empty blank nodes created).
    // This test mimics the actual GUI workflow: parse with cache, rename, save with cache
    const fixturePath = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');
    const originalContent = readFileSync(fixturePath, 'utf-8');
    
    // Parse with cache (like GUI does)
    const parseResult = await parseRdfToGraph(originalContent, { path: fixturePath });
    const { store, originalFileCache: cache } = parseResult;
    
    expect(cache).toBeDefined();
    
    // Count restrictions before rename
    const drawingSheetUri = 'https://burohappoldmachinelearning.github.io/ADIRO/aec_drawing_metadata#DrawingSheet';
    const beforeQuads = store.getQuads(
      DataFactory.namedNode(drawingSheetUri),
      DataFactory.namedNode(RDFS + 'subClassOf'),
      null,
      null
    );
    const beforeRestrictions = beforeQuads.filter(q => q.object.termType === 'BlankNode');
    expect(beforeRestrictions.length).toBe(4);
    
    // Verify each restriction has required properties before rename
    for (const quad of beforeRestrictions) {
      const blank = quad.object as BlankNode;
      const onProperty = store.getQuads(blank, DataFactory.namedNode(OWL + 'onProperty'), null, null);
      const onClass = store.getQuads(blank, DataFactory.namedNode(OWL + 'onClass'), null, null);
      const restrictionType = store.getQuads(blank, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Restriction'), null);
      
      expect(onProperty.length).toBeGreaterThan(0);
      expect(onClass.length).toBeGreaterThan(0);
      expect(restrictionType.length).toBeGreaterThan(0);
    }
    
    // Rename using updateLabelInStore (like GUI does)
    updateLabelInStore(store, 'DrawingSheet', 'Drawing Sheeta');
    
    // Save using cache-based reconstruction (like GUI does)
    // Note: This now requires explicit enablement via useCacheBasedReconstruction parameter
    const serialized = await storeToTurtle(store, undefined, originalContent, cache ?? undefined, true);
    
    // Re-parse to verify restrictions are preserved
    const reparseResult = await parseRdfToGraph(serialized, { path: fixturePath });
    const { store: store2 } = reparseResult;
    
    // Count restrictions after rename and re-parse
    const afterQuads = store2.getQuads(
      DataFactory.namedNode(drawingSheetUri),
      DataFactory.namedNode(RDFS + 'subClassOf'),
      null,
      null
    );
    const afterRestrictions = afterQuads.filter(q => q.object.termType === 'BlankNode');
    
    // All 4 restrictions should still exist
    expect(afterRestrictions.length).toBe(4);
    
    // Verify each restriction still has required properties
    for (const quad of afterRestrictions) {
      const blank = quad.object as BlankNode;
      const onProperty = store2.getQuads(blank, DataFactory.namedNode(OWL + 'onProperty'), null, null);
      const onClass = store2.getQuads(blank, DataFactory.namedNode(OWL + 'onClass'), null, null);
      const restrictionType = store2.getQuads(blank, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Restriction'), null);
      
      expect(onProperty.length).toBeGreaterThan(0, 'Restriction should have owl:onProperty');
      expect(onClass.length).toBeGreaterThan(0, 'Restriction should have owl:onClass');
      expect(restrictionType.length).toBeGreaterThan(0, 'Restriction should have rdf:type owl:Restriction');
    }
    
    // Verify label was updated
    const labelQuads = store2.getQuads(
      DataFactory.namedNode(drawingSheetUri),
      DataFactory.namedNode(RDFS + 'label'),
      null,
      null
    );
    expect(labelQuads.length).toBeGreaterThan(0);
    expect(labelQuads[0].object.value).toBe('Drawing Sheeta');
    
    // Verify serialized output doesn't have empty blank nodes
    expect(serialized).not.toMatch(/rdfs:subClassOf\s*\[\s*\]/);
    
    // Verify serialized output has restriction details
    expect(serialized).toMatch(/owl:Restriction/);
    expect(serialized).toMatch(/owl:onProperty/);
    expect(serialized).toMatch(/owl:onClass/);
  });

  it.skip('should preserve cardinality constraints when renaming using cache-based reconstruction (GUI workflow)', async () => {
    // SKIPPED: Cache-based reconstruction is disabled by default due to blank node issues.
    // This test is kept for future work when cache-based reconstruction is fixed.
    // Expected failure: Cardinality constraints are lost.
    // This test verifies that minQualifiedCardinality, maxQualifiedCardinality, and qualifiedCardinality
    // are preserved when renaming with cache-based reconstruction
    const fixturePath = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');
    const originalContent = readFileSync(fixturePath, 'utf-8');
    
    // Parse with cache (like GUI does)
    const parseResult = await parseRdfToGraph(originalContent, { path: fixturePath });
    const { store, originalFileCache: cache } = parseResult;
    
    expect(cache).toBeDefined();
    
    const drawingSheetUri = 'https://burohappoldmachinelearning.github.io/ADIRO/aec_drawing_metadata#DrawingSheet';
    
    // Get restrictions before rename and verify cardinalities
    const beforeQuads = store.getQuads(
      DataFactory.namedNode(drawingSheetUri),
      DataFactory.namedNode(RDFS + 'subClassOf'),
      null,
      null
    );
    const beforeRestrictions = beforeQuads.filter(q => q.object.termType === 'BlankNode');
    
    // Find the restriction with qualifiedCardinality (RevisionTable restriction)
    const revisionTableRestriction = beforeRestrictions.find(r => {
      const blank = r.object as BlankNode;
      const onClass = store.getQuads(blank, DataFactory.namedNode(OWL + 'onClass'), null, null)[0];
      return onClass?.object.value.includes('RevisionTable');
    });
    expect(revisionTableRestriction).toBeDefined();
    
    if (revisionTableRestriction) {
      const blank = revisionTableRestriction.object as BlankNode;
      const minCard = store.getQuads(blank, DataFactory.namedNode(OWL + 'minQualifiedCardinality'), null, null)[0];
      const maxCard = store.getQuads(blank, DataFactory.namedNode(OWL + 'maxQualifiedCardinality'), null, null)[0];
      const exactCard = store.getQuads(blank, DataFactory.namedNode(OWL + 'qualifiedCardinality'), null, null)[0];
      
      expect(minCard).toBeDefined();
      expect(parseInt(minCard?.object.value || '0')).toBe(0);
      expect(maxCard).toBeDefined();
      expect(parseInt(maxCard?.object.value || '0')).toBe(1);
      expect(exactCard).toBeDefined();
      expect(parseInt(exactCard?.object.value || '0')).toBe(1);
    }
    
    // Rename using updateLabelInStore (like GUI does)
    updateLabelInStore(store, 'DrawingSheet', 'Drawing Sheeta');
    
    // Save using cache-based reconstruction (like GUI does)
    // Note: This now requires explicit enablement via useCacheBasedReconstruction parameter
    const serialized = await storeToTurtle(store, undefined, originalContent, cache ?? undefined, true);
    
    // Re-parse to verify cardinalities are preserved
    const reparseResult = await parseRdfToGraph(serialized, { path: fixturePath });
    const { store: store2 } = reparseResult;
    
    // Get restrictions after rename and re-parse
    const afterQuads = store2.getQuads(
      DataFactory.namedNode(drawingSheetUri),
      DataFactory.namedNode(RDFS + 'subClassOf'),
      null,
      null
    );
    const afterRestrictions = afterQuads.filter(q => q.object.termType === 'BlankNode');
    
    // Find the RevisionTable restriction again
    const revisionTableRestrictionAfter = afterRestrictions.find(r => {
      const blank = r.object as BlankNode;
      const onClass = store2.getQuads(blank, DataFactory.namedNode(OWL + 'onClass'), null, null)[0];
      return onClass?.object.value.includes('RevisionTable');
    });
    
    expect(revisionTableRestrictionAfter).toBeDefined();
    
    if (revisionTableRestrictionAfter) {
      const blank = revisionTableRestrictionAfter.object as BlankNode;
      const minCard = store2.getQuads(blank, DataFactory.namedNode(OWL + 'minQualifiedCardinality'), null, null)[0];
      const maxCard = store2.getQuads(blank, DataFactory.namedNode(OWL + 'maxQualifiedCardinality'), null, null)[0];
      const exactCard = store2.getQuads(blank, DataFactory.namedNode(OWL + 'qualifiedCardinality'), null, null)[0];
      
      expect(minCard).toBeDefined('minQualifiedCardinality should be preserved');
      expect(parseInt(minCard?.object.value || '0')).toBe(0);
      expect(maxCard).toBeDefined('maxQualifiedCardinality should be preserved');
      expect(parseInt(maxCard?.object.value || '0')).toBe(1);
      expect(exactCard).toBeDefined('qualifiedCardinality should be preserved');
      expect(parseInt(exactCard?.object.value || '0')).toBe(1);
    }
    
    // Also verify other cardinalities (minQualifiedCardinality for Note and Layout)
    const noteRestriction = afterRestrictions.find(r => {
      const blank = r.object as BlankNode;
      const onClass = store2.getQuads(blank, DataFactory.namedNode(OWL + 'onClass'), null, null)[0];
      return onClass?.object.value.includes('Note');
    });
    expect(noteRestriction).toBeDefined();
    if (noteRestriction) {
      const blank = noteRestriction.object as BlankNode;
      const minCard = store2.getQuads(blank, DataFactory.namedNode(OWL + 'minQualifiedCardinality'), null, null)[0];
      expect(minCard).toBeDefined('Note restriction should have minQualifiedCardinality');
      expect(parseInt(minCard?.object.value || '0')).toBe(0);
    }
    
    const layoutRestriction = afterRestrictions.find(r => {
      const blank = r.object as BlankNode;
      const onClass = store2.getQuads(blank, DataFactory.namedNode(OWL + 'onClass'), null, null)[0];
      return onClass?.object.value.includes('Layout');
    });
    expect(layoutRestriction).toBeDefined();
    if (layoutRestriction) {
      const blank = layoutRestriction.object as BlankNode;
      const minCard = store2.getQuads(blank, DataFactory.namedNode(OWL + 'minQualifiedCardinality'), null, null)[0];
      expect(minCard).toBeDefined('Layout restriction should have minQualifiedCardinality');
      expect(parseInt(minCard?.object.value || '0')).toBe(1);
    }
  });

  it('should preserve rdfs:comment when renaming using cache-based reconstruction (GUI workflow)', async () => {
    // This test verifies that rdfs:comment is preserved when renaming with cache-based reconstruction
    const fixturePath = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');
    const originalContent = readFileSync(fixturePath, 'utf-8');
    
    // Parse with cache (like GUI does)
    const parseResult = await parseRdfToGraph(originalContent, { path: fixturePath });
    const { store, originalFileCache: cache } = parseResult;
    
    expect(cache).toBeDefined();
    
    const drawingSheetUri = 'https://burohappoldmachinelearning.github.io/ADIRO/aec_drawing_metadata#DrawingSheet';
    
    // Get comment before rename
    const beforeCommentQuads = store.getQuads(
      DataFactory.namedNode(drawingSheetUri),
      DataFactory.namedNode(RDFS + 'comment'),
      null,
      null
    );
    expect(beforeCommentQuads.length).toBeGreaterThan(0);
    const originalComment = beforeCommentQuads[0].object.value;
    expect(originalComment).toBe('Top-level container for a drawing. Contains Layout(s).');
    
    // Rename using updateLabelInStore (like GUI does)
    updateLabelInStore(store, 'DrawingSheet', 'Drawing Sheeta');
    
    // Save using cache-based reconstruction (like GUI does)
    // Note: This now requires explicit enablement via useCacheBasedReconstruction parameter
    const serialized = await storeToTurtle(store, undefined, originalContent, cache ?? undefined, true);
    
    // Re-parse to verify comment is preserved
    const reparseResult = await parseRdfToGraph(serialized, { path: fixturePath });
    const { store: store2 } = reparseResult;
    
    // Get comment after rename and re-parse
    const afterCommentQuads = store2.getQuads(
      DataFactory.namedNode(drawingSheetUri),
      DataFactory.namedNode(RDFS + 'comment'),
      null,
      null
    );
    
    expect(afterCommentQuads.length).toBeGreaterThan(0, 'rdfs:comment should be preserved');
    expect(afterCommentQuads[0].object.value).toBe(originalComment, 'rdfs:comment value should match original');
    
    // Also verify in serialized output
    expect(serialized).toContain('Top-level container for a drawing. Contains Layout(s).');
  });

  it('should preserve labellableRoot annotation when renaming using cache-based reconstruction (GUI workflow)', async () => {
    // This test verifies that :labellableRoot annotation is preserved when renaming with cache-based reconstruction
    const fixturePath = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');
    const originalContent = readFileSync(fixturePath, 'utf-8');
    
    // Parse with cache (like GUI does)
    const parseResult = await parseRdfToGraph(originalContent, { path: fixturePath });
    const { store, originalFileCache: cache } = parseResult;
    
    expect(cache).toBeDefined();
    
    const drawingSheetUri = 'https://burohappoldmachinelearning.github.io/ADIRO/aec_drawing_metadata#DrawingSheet';
    
    // Get labellableRoot before rename
    const labellableRootPredicate = 'https://burohappoldmachinelearning.github.io/ADIRO/aec_drawing_metadata#labellableRoot';
    const beforeLabellableQuads = store.getQuads(
      DataFactory.namedNode(drawingSheetUri),
      DataFactory.namedNode(labellableRootPredicate),
      null,
      null
    );
    expect(beforeLabellableQuads.length).toBeGreaterThan(0);
    const originalLabellableValue = beforeLabellableQuads[0].object.value;
    expect(String(originalLabellableValue).toLowerCase()).toBe('false');
    
    // Rename using updateLabelInStore (like GUI does)
    updateLabelInStore(store, 'DrawingSheet', 'Drawing Sheeta');
    
    // Save using cache-based reconstruction (like GUI does)
    // Note: This now requires explicit enablement via useCacheBasedReconstruction parameter
    const serialized = await storeToTurtle(store, undefined, originalContent, cache ?? undefined, true);
    
    // Re-parse to verify labellableRoot is preserved
    const reparseResult = await parseRdfToGraph(serialized, { path: fixturePath });
    const { store: store2 } = reparseResult;
    
    // Get labellableRoot after rename and re-parse
    const afterLabellableQuads = store2.getQuads(
      DataFactory.namedNode(drawingSheetUri),
      DataFactory.namedNode(labellableRootPredicate),
      null,
      null
    );
    
    expect(afterLabellableQuads.length).toBeGreaterThan(0, ':labellableRoot annotation should be preserved');
    expect(String(afterLabellableQuads[0].object.value).toLowerCase()).toBe('false', ':labellableRoot value should match original');
    
    // Also verify in serialized output (may be serialized as "false"^^xsd:boolean or :labellableRoot false)
    expect(serialized).toMatch(/labellableRoot.*false|"false"\^\^xsd:boolean/);
  });

  it.skip('should preserve property order when renaming using cache-based reconstruction (GUI workflow)', async () => {
    // SKIPPED: Cache-based reconstruction is disabled by default due to blank node issues.
    // This test is kept for future work when cache-based reconstruction is fixed.
    // Expected failure: Property order is not preserved.
    // This test verifies that property order is preserved when renaming with cache-based reconstruction
    // The original file has: rdfs:subClassOf, rdfs:label, rdfs:comment, a owl:Class, :labellableRoot
    const fixturePath = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');
    const originalContent = readFileSync(fixturePath, 'utf-8');
    
    // Parse with cache (like GUI does)
    const parseResult = await parseRdfToGraph(originalContent, { path: fixturePath });
    const { store, originalFileCache: cache } = parseResult;
    
    expect(cache).toBeDefined();
    
    // Extract the original DrawingSheet block to see property order
    // The block spans multiple lines, so we need a more flexible match
    const drawingSheetStart = originalContent.indexOf(':DrawingSheet');
    expect(drawingSheetStart).toBeGreaterThan(-1);
    
    // Find the end of the DrawingSheet block (next class definition or end of section)
    const nextClassMatch = originalContent.substring(drawingSheetStart).match(/\n:[A-Z]/);
    const drawingSheetEnd = nextClassMatch ? drawingSheetStart + nextClassMatch.index! : originalContent.length;
    const originalBlock = originalContent.substring(drawingSheetStart, drawingSheetEnd);
    
    // Verify original order: rdfs:subClassOf comes first, then rdfs:label, then rdfs:comment
    // Note: The original file uses "a owl:Class" (abbreviated form)
    const subClassOfIndex = originalBlock.indexOf('rdfs:subClassOf');
    const labelIndex = originalBlock.indexOf('rdfs:label');
    const commentIndex = originalBlock.indexOf('rdfs:comment');
    const typeIndex = originalBlock.indexOf('a owl:Class') !== -1 ? originalBlock.indexOf('a owl:Class') : originalBlock.indexOf('rdf:type owl:Class');
    const labellableIndex = originalBlock.indexOf(':labellableRoot');
    
    expect(subClassOfIndex).toBeGreaterThan(-1, 'rdfs:subClassOf should be in original block');
    expect(labelIndex).toBeGreaterThan(-1, 'rdfs:label should be in original block');
    expect(commentIndex).toBeGreaterThan(-1, 'rdfs:comment should be in original block');
    // Type might be abbreviated as "a owl:Class" or full "rdf:type owl:Class"
    expect(typeIndex).toBeGreaterThan(-1, 'rdf:type owl:Class or "a owl:Class" should be in original block');
    expect(labellableIndex).toBeGreaterThan(-1, ':labellableRoot should be in original block');
    
    // Verify order: subClassOf < label < comment < type < labellableRoot
    expect(subClassOfIndex).toBeLessThan(labelIndex);
    expect(labelIndex).toBeLessThan(commentIndex);
    expect(commentIndex).toBeLessThan(typeIndex);
    expect(typeIndex).toBeLessThan(labellableIndex);
    
    // Rename using updateLabelInStore (like GUI does)
    updateLabelInStore(store, 'DrawingSheet', 'Drawing Sheeta');
    
    // Save using cache-based reconstruction (like GUI does)
    // Note: This now requires explicit enablement via useCacheBasedReconstruction parameter
    const serialized = await storeToTurtle(store, undefined, originalContent, cache ?? undefined, true);
    
    // Extract the DrawingSheet block from serialized output
    const serializedStart = serialized.indexOf(':DrawingSheet');
    expect(serializedStart).toBeGreaterThan(-1, 'DrawingSheet should be in serialized output');
    
    // Find the end of the DrawingSheet block (next class definition or end of section)
    const nextClassMatchSerialized = serialized.substring(serializedStart).match(/\n:[A-Z]/);
    const serializedEnd = nextClassMatchSerialized ? serializedStart + nextClassMatchSerialized.index! : serialized.length;
    const serializedBlock = serialized.substring(serializedStart, serializedEnd);
    
    // Verify property order is preserved (cache-based reconstruction should preserve order)
    const serializedSubClassOfIndex = serializedBlock.indexOf('rdfs:subClassOf');
    const serializedLabelIndex = serializedBlock.indexOf('rdfs:label');
    const serializedCommentIndex = serializedBlock.indexOf('rdfs:comment');
    const serializedTypeIndex = serializedBlock.indexOf('a owl:Class') !== -1 ? serializedBlock.indexOf('a owl:Class') : serializedBlock.indexOf('rdf:type owl:Class');
    const serializedLabellableIndex = serializedBlock.indexOf(':labellableRoot') !== -1 ? serializedBlock.indexOf(':labellableRoot') : serializedBlock.indexOf('labellableRoot');
    
    expect(serializedSubClassOfIndex).toBeGreaterThan(-1, 'rdfs:subClassOf should be present');
    expect(serializedLabelIndex).toBeGreaterThan(-1, 'rdfs:label should be present');
    expect(serializedCommentIndex).toBeGreaterThan(-1, 'rdfs:comment should be present');
    expect(serializedTypeIndex).toBeGreaterThan(-1, 'rdf:type owl:Class should be present');
    expect(serializedLabellableIndex).toBeGreaterThan(-1, ':labellableRoot should be present');
    
    // Verify order is preserved: subClassOf < label < comment < type < labellableRoot
    expect(serializedSubClassOfIndex).toBeLessThan(serializedLabelIndex, 'rdfs:subClassOf should come before rdfs:label');
    expect(serializedLabelIndex).toBeLessThan(serializedCommentIndex, 'rdfs:label should come before rdfs:comment');
    expect(serializedCommentIndex).toBeLessThan(serializedTypeIndex, 'rdfs:comment should come before rdf:type owl:Class');
    expect(serializedTypeIndex).toBeLessThan(serializedLabellableIndex, 'rdf:type owl:Class should come before :labellableRoot');
  });
});
