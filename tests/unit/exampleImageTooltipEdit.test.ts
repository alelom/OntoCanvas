/**
 * After a class is edited, the images its tooltip shows (#142) follow the same rule as on load: only ADIRO's
 * exampleImage, when the ontology declares or imports it, in display order.
 */
import { describe, it, expect } from 'vitest';
import { parseRdfToGraph } from '../../src/parser';
import { applyNodeFormToStore } from '../../src/ui/nodeModalForm';
import { ADIRO_EXAMPLE_IMAGE } from '../../src/lib/exampleImages';
import type { GraphNode } from '../../src/types';

const ontology = (declaration: string) => `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:Ontology rdf:type owl:Ontology .
${declaration}
:Room rdf:type owl:Class ; rdfs:label "Room" .
`;
const IMAGES = ['https://example.org/img/Room_02.png', 'https://example.org/img/Room_01.png'];
const form = { comment: '', annotationValues: {}, textualAnnotationValues: { exampleImage: IMAGES }, dataPropertyRestrictions: [] };

async function edit(declaration: string, propertyUri: string): Promise<GraphNode> {
  const { store, graphData } = await parseRdfToGraph(ontology(declaration), { path: 'test.ttl' });
  const room = graphData.nodes.find((n) => n.id === 'Room')!;
  applyNodeFormToStore('Room', form, store, room, 'http://example.org/test#', [
    { name: 'exampleImage', isBoolean: false, uri: propertyUri },
  ]);
  return room;
}

describe('example images after editing a class (#142)', () => {
  it("ADIRO's exampleImage, declared: the tooltip shows the new values, in order", async () => {
    const room = await edit(`<${ADIRO_EXAMPLE_IMAGE}> rdf:type owl:AnnotationProperty .`, ADIRO_EXAMPLE_IMAGE);
    expect(room.exampleImages).toEqual([IMAGES[1], IMAGES[0]]);
  });

  it('another property named exampleImage: saved, but not shown in the tooltip', async () => {
    const room = await edit(':exampleImage rdf:type owl:AnnotationProperty .', 'http://example.org/test#exampleImage');
    expect(room.exampleImages).toBeUndefined();
  });
});
