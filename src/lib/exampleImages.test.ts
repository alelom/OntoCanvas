import { describe, it, expect } from 'vitest';
import { Parser, Store } from 'n3';
import { exampleImagesOf, adiroExampleImageAvailable, sortExampleImages, resolveExampleImages, ADIRO_EXAMPLE_IMAGE } from './exampleImages';
import { parseRdfToGraph } from '../ontology/buildGraph';

function storeOf(ttl: string, baseIRI?: string): Store {
  const store = new Store();
  store.addQuads(new Parser({ baseIRI }).parse(ttl));
  return store;
}

const PREFIXES = `
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix adiro: <https://w3id.org/adiro/aec_drawing_metadata#> .
@prefix img: <https://w3id.org/adiro/aec_drawing_metadata/exampleImage/> .
@prefix : <https://example.org/other#> .
`;
const DECLARED = `adiro:exampleImage a owl:AnnotationProperty .`;

describe('the ADIRO exampleImage property (#142)', () => {
  it('is the ADIRO IRI', () => {
    expect(ADIRO_EXAMPLE_IMAGE).toBe('https://w3id.org/adiro/aec_drawing_metadata#exampleImage');
  });

  it('is available when the ontology declares it as an annotation property', () => {
    expect(adiroExampleImageAvailable(storeOf(`${PREFIXES} ${DECLARED}`))).toBe(true);
  });

  it('is available when the ontology imports the ADIRO module that defines it, by IRI or by a version IRI', () => {
    for (const iri of [
      'https://w3id.org/adiro/aec_drawing_metadata',
      'https://w3id.org/adiro/aec_drawing_metadata/5.0.0',
      'https://w3id.org/adiro/aec_drawing_metadata.ttl',
    ]) {
      expect(adiroExampleImageAvailable(storeOf(`${PREFIXES} <https://example.org/other> a owl:Ontology ; owl:imports <${iri}> .`))).toBe(true);
    }
  });

  it('is not available when it is neither declared nor imported, even if values use it', () => {
    const store = storeOf(`${PREFIXES} :Beam a owl:Class ; adiro:exampleImage img:Beam_01.png .`);
    expect(adiroExampleImageAvailable(store)).toBe(false);
    expect(exampleImagesOf(store, 'https://example.org/other#Beam')).toEqual([]);
  });
});

describe('exampleImagesOf (#142)', () => {
  it('reads the values on a term in another namespace than the property', () => {
    const store = storeOf(`${PREFIXES} ${DECLARED}
      :Beam a owl:Class ; adiro:exampleImage img:Beam_01.png .`);
    expect(exampleImagesOf(store, 'https://example.org/other#Beam')).toEqual([
      'https://w3id.org/adiro/aec_drawing_metadata/exampleImage/Beam_01.png',
    ]);
  });

  it('ignores another property that is also named exampleImage', () => {
    const store = storeOf(`${PREFIXES} ${DECLARED}
      :exampleImage a owl:AnnotationProperty .
      :Beam a owl:Class ; :exampleImage <https://example.org/beam.png> .`);
    expect(exampleImagesOf(store, 'https://example.org/other#Beam')).toEqual([]);
  });

  it('sorts the values in their NN order, numbers compared as numbers', () => {
    const store = storeOf(`${PREFIXES} ${DECLARED}
      :Plan a owl:Class ; adiro:exampleImage img:Plan_10.png , img:Plan_02.png , img:Plan_01.png .`);
    expect(exampleImagesOf(store, 'https://example.org/other#Plan').map((u) => u.split('/').pop())).toEqual([
      'Plan_01.png',
      'Plan_02.png',
      'Plan_10.png',
    ]);
  });

  it('reads the values of a relationship', () => {
    const store = storeOf(`${PREFIXES} ${DECLARED}
      :hasPart a owl:ObjectProperty ; adiro:exampleImage img:hasPart_01.png .`);
    expect(exampleImagesOf(store, 'https://example.org/other#hasPart')).toHaveLength(1);
  });

  it('keeps URL-like literals (older files) and ignores other literals', () => {
    const store = storeOf(`${PREFIXES} ${DECLARED}
      :Wall a owl:Class ;
        adiro:exampleImage "https://example.org/wall.png"^^xsd:anyURI , "img/wall_02.png" , "not an image" .`);
    expect(exampleImagesOf(store, 'https://example.org/other#Wall')).toEqual([
      'https://example.org/wall.png',
      'img/wall_02.png',
    ]);
  });

  it('returns nothing for a term without example images', () => {
    const store = storeOf(`${PREFIXES} ${DECLARED}
      :Door a owl:Class ; rdfs:seeAlso <https://example.org/door.png> .`);
    expect(exampleImagesOf(store, 'https://example.org/other#Door')).toEqual([]);
  });
});

describe('sortExampleImages', () => {
  it('drops duplicates', () => {
    expect(sortExampleImages(['a_02.png', 'a_01.png', 'a_02.png'])).toEqual(['a_01.png', 'a_02.png']);
  });
});

describe('resolveExampleImages', () => {
  it('resolves relative values against the address the ontology was opened from', () => {
    expect(resolveExampleImages(['exampleImage/W_01.png'], 'https://example.org/onto/examples/x.ttl')).toEqual([
      'https://example.org/onto/examples/exampleImage/W_01.png',
    ]);
  });

  it('keeps an absolute value, and a relative one that cannot be resolved (it then shows as not available)', () => {
    expect(resolveExampleImages(['https://example.org/a.png', 'img/b.png'], null)).toEqual([
      'https://example.org/a.png',
      'img/b.png',
    ]);
  });
});

describe('the parser carries example images on classes, relationships and data properties', () => {
  const ONTOLOGY = (header: string) => `${PREFIXES}
      @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
      <https://example.org/other> a owl:Ontology ${header} .
      :Room a owl:Class ; adiro:exampleImage img:Room_02.png , img:Room_01.png .
      :Wall a owl:Class .
      :hasWall a owl:ObjectProperty ; rdfs:domain :Room ; rdfs:range :Wall ; adiro:exampleImage img:hasWall_01.png .
      :height a owl:DatatypeProperty ; rdfs:domain :Room ; rdfs:range xsd:decimal ; adiro:exampleImage img:height_01.png .`;

  it('reads them, in order, from an ontology that imports the ADIRO module', async () => {
    const { graphData, objectProperties, dataProperties } = await parseRdfToGraph(
      ONTOLOGY('; owl:imports <https://w3id.org/adiro/aec_drawing_metadata>'),
      { path: 'x.ttl' }
    );
    const room = graphData.nodes.find((n) => n.id === 'Room');
    expect(room?.exampleImages?.map((u) => u.split('/').pop())).toEqual(['Room_01.png', 'Room_02.png']);
    expect(graphData.nodes.find((n) => n.id === 'Wall')?.exampleImages).toBeUndefined();
    expect(objectProperties.find((p) => p.name === 'hasWall')?.exampleImages).toHaveLength(1);
    expect(dataProperties.find((p) => p.name === 'height')?.exampleImages).toHaveLength(1);
  });

  it('reads none when the ontology neither declares nor imports the property', async () => {
    const { graphData, objectProperties } = await parseRdfToGraph(ONTOLOGY(''), { path: 'x.ttl' });
    expect(graphData.nodes.find((n) => n.id === 'Room')?.exampleImages).toBeUndefined();
    expect(objectProperties.find((p) => p.name === 'hasWall')?.exampleImages).toBeUndefined();
  });
});

const STANDARD = `
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix schema: <https://schema.org/> .
@prefix schemahttp: <http://schema.org/> .
`;

describe('standard image properties, read whenever used (#143)', () => {
  it('foaf:depiction, with no declaration or import', () => {
    const store = storeOf(`${PREFIXES} ${STANDARD}
      :Gear a owl:Class ; foaf:depiction <https://example.org/gear_02.png> , <https://example.org/gear_01.png> .`);
    expect(exampleImagesOf(store, 'https://example.org/other#Gear')).toEqual([
      'https://example.org/gear_01.png',
      'https://example.org/gear_02.png',
    ]);
  });

  it('schema:image, https and http, as a URL or as a node with schema:contentUrl', () => {
    const store = storeOf(`${PREFIXES} ${STANDARD}
      :Bolt a owl:Class ; schema:image <https://example.org/bolt.png> .
      :Nut a owl:Class ; schemahttp:image [ a schema:ImageObject ; schema:contentUrl <https://example.org/nut.png> ] .
      :Pin a owl:Class ; schema:image "https://example.org/pin.png" .`);
    expect(exampleImagesOf(store, 'https://example.org/other#Bolt')).toEqual(['https://example.org/bolt.png']);
    expect(exampleImagesOf(store, 'https://example.org/other#Nut')).toEqual(['https://example.org/nut.png']);
    expect(exampleImagesOf(store, 'https://example.org/other#Pin')).toEqual(['https://example.org/pin.png']);
  });

  it('a property declared a subproperty of an image property, also transitively', () => {
    const store = storeOf(`${PREFIXES} ${STANDARD}
      :photo a owl:AnnotationProperty ; rdfs:subPropertyOf foaf:depiction .
      :closeUp a owl:AnnotationProperty ; rdfs:subPropertyOf :photo .
      :Washer a owl:Class ; :photo <https://example.org/washer.png> ; :closeUp <https://example.org/washer_close.png> .`);
    expect(exampleImagesOf(store, 'https://example.org/other#Washer').sort()).toEqual([
      'https://example.org/washer.png',
      'https://example.org/washer_close.png',
    ]);
  });

  it('a subproperty of ADIRO exampleImage counts, and ADIRO linked to foaf:depiction needs nothing more', () => {
    const store = storeOf(`${PREFIXES} ${STANDARD}
      adiro:exampleImage rdfs:subPropertyOf foaf:depiction .
      :Beam a owl:Class ; adiro:exampleImage img:Beam_01.png .`);
    expect(exampleImagesOf(store, 'https://example.org/other#Beam')).toHaveLength(1);
  });

  it('one list for a term with several: ADIRO first, then foaf:depiction, then schema:image, without duplicates', () => {
    const store = storeOf(`${PREFIXES} ${STANDARD} ${DECLARED}
      :Spring a owl:Class ;
        schema:image <https://example.org/a_schema.png> ;
        foaf:depiction <https://example.org/b_foaf.png> , <https://example.org/a_schema.png> ;
        adiro:exampleImage <https://example.org/z_adiro.png> .`);
    expect(exampleImagesOf(store, 'https://example.org/other#Spring')).toEqual([
      'https://example.org/z_adiro.png',
      'https://example.org/a_schema.png',
      'https://example.org/b_foaf.png',
    ]);
  });

  it('other image-like properties are not read', () => {
    const store = storeOf(`${PREFIXES} ${STANDARD}
      :Cog a owl:Class ; foaf:img <https://example.org/cog.png> ; foaf:thumbnail <https://example.org/cog_t.png> .`);
    expect(exampleImagesOf(store, 'https://example.org/other#Cog')).toEqual([]);
  });
});
