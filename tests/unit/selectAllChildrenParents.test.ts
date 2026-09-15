import { describe, it, expect } from 'vitest';
import { parseRdfToGraph } from '../../src/parser';
import { getTransitiveChildIds, getTransitiveParentIds } from '../../src/lib/classGraphTraversal';

// Reproduces the reported bug: right-clicking "Layout content type" in the ADIRO
// aec_drawing_metadata ontology and choosing "Select all children" pulled in
// unrelated nodes (Layout, DrawingSheet, DrawingRevision, Titleblock) by following
// non-subClassOf property/restriction edges backward through the graph.
const TTL = `
@prefix : <http://example.org/aec-drawing-ontology#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Ontology rdf:type owl:Ontology .

:hasProperty rdf:type owl:ObjectProperty ;
  rdfs:label "hasProperty" ;
  rdfs:range owl:Thing ;
  rdfs:domain owl:Thing .

:hasOrientation rdf:type owl:ObjectProperty ;
  rdfs:label "hasOrientation" ;
  rdfs:range :OrientationValue ;
  rdfs:domain [ rdf:type owl:Class ; owl:unionOf ( :Section :Detail ) ] .

:contains rdf:type owl:ObjectProperty ;
  rdfs:label "contains" ;
  rdfs:range owl:Thing ;
  rdfs:domain owl:Thing .

:DrawingSheet rdf:type owl:Class ;
  rdfs:subClassOf [ rdf:type owl:Restriction ; owl:onProperty :contains ; owl:onClass :Layout ] ;
  rdfs:label "DrawingSheet" .

:Layout rdf:type owl:Class ;
  rdfs:subClassOf [ rdf:type owl:Restriction ; owl:onProperty :hasProperty ; owl:onClass :LayoutContentType ] ;
  rdfs:label "Layout" .

:LayoutContentType rdf:type owl:Class ;
  rdfs:label "Layout content type" .

:Plan rdf:type owl:Class ;
  rdfs:subClassOf :LayoutContentType ;
  rdfs:label "Plan" .

:Section rdf:type owl:Class ;
  rdfs:subClassOf :LayoutContentType,
    [ rdf:type owl:Restriction ; owl:onProperty :hasOrientation ; owl:onClass :OrientationValue ] ;
  rdfs:label "Section" .

:Detail rdf:type owl:Class ;
  rdfs:subClassOf :LayoutContentType,
    [ rdf:type owl:Restriction ; owl:onProperty :hasOrientation ; owl:onClass :OrientationValue ] ;
  rdfs:label "Detail" .

:OrientationValue rdf:type owl:Class ;
  rdfs:label "Orientation" .
`;

describe('Select all children / parents context menu commands', () => {
  it('selects only the subclass hierarchy plus property targets reached from it, not unrelated container classes', async () => {
    const { graphData } = await parseRdfToGraph(TTL, { path: 'test.ttl' });
    const classIds = new Set(graphData.nodes.map((n) => n.id));

    const children = getTransitiveChildIds('LayoutContentType', graphData.edges, classIds);

    expect(children.sort()).toEqual(
      ['Detail', 'LayoutContentType', 'OrientationValue', 'Plan', 'Section'].sort()
    );
    // These were the reported surplus: pulled in only because Layout carries a
    // "hasProperty -> LayoutContentType" restriction, and DrawingSheet "contains" Layout.
    expect(children).not.toContain('Layout');
    expect(children).not.toContain('DrawingSheet');
  });

  it('selects the mirror set for "select all parents" starting from the property target', async () => {
    const { graphData } = await parseRdfToGraph(TTL, { path: 'test.ttl' });
    const classIds = new Set(graphData.nodes.map((n) => n.id));

    const parents = getTransitiveParentIds('OrientationValue', graphData.edges, classIds);

    // OrientationValue is the hasOrientation target of Section and Detail (added as its
    // "parents" - the mirror of the children rule); Section/Detail's own superclass
    // LayoutContentType is added via subClassOf; LayoutContentType is in turn the
    // hasProperty target of Layout, and Layout the contains target of DrawingSheet -
    // each hop is the mirror of a hop that would count as a "child" in the other direction.
    expect(parents.sort()).toEqual(
      ['Detail', 'DrawingSheet', 'Layout', 'LayoutContentType', 'OrientationValue', 'Section'].sort()
    );
  });
});
