/**
 * The ontologies the data was made with (#236): what the data names (prov:used, dct:conformsTo, void:vocabulary), or else the
 * namespaces of its classes and properties, less what is loaded already, and the note that says what was read. Nothing is fetched here.
 */
import { describe, it, expect } from 'vitest';
import { Parser, Store } from 'n3';
import { dataOntologiesNote, findDataOntologies, ontologyName } from '../../src/abox/dataOntologies';

const nq = (text: string) => new Store(new Parser({ format: 'N-Quads' }).parse(text));
const PROV_USED = 'http://www.w3.org/ns/prov#used';
const TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RUN = `<urn:run:1> <${TYPE}> <http://www.w3.org/ns/prov#Activity> <urn:run:1> .
<urn:run:1> <${PROV_USED}> <https://w3id.org/adiro/adiro_drawing_metadata/7.0.1> <urn:run:1> .
<urn:run:1> <${PROV_USED}> <https://w3id.org/adiro/adiro_provenance/2.2.0> <urn:run:1> .
<urn:run:1> <${PROV_USED}> <urn:file:page1> <urn:run:1> .
<urn:step:1> <${PROV_USED}> <https://w3id.org/adiro/adiro_provenance/2.2.0> <urn:run:1> .
<urn:x:1> <${TYPE}> <https://w3id.org/adiro/adiro_provenance#FieldAssertion> <urn:run:1> .
`;

describe('findDataOntologies', () => {
  it('gives what the data says it used, each once, in order, leaving out what is not an http address', () => {
    expect(findDataOntologies([nq(RUN)], [])).toEqual([
      { iri: 'https://w3id.org/adiro/adiro_drawing_metadata/7.0.1', via: 'prov:used' },
      { iri: 'https://w3id.org/adiro/adiro_provenance/2.2.0', via: 'prov:used' },
    ]);
  });

  it('reads dct:conformsTo and void:vocabulary too', () => {
    const data = nq(
      '<urn:d> <http://purl.org/dc/terms/conformsTo> <https://example.org/onto/1.0> .\n<urn:d> <http://rdfs.org/ns/void#vocabulary> <https://example.org/vocab> .\n'
    );

    expect(findDataOntologies([data], []).map((o) => [o.iri, o.via])).toEqual([
      ['https://example.org/onto/1.0', 'dct:conformsTo'],
      ['https://example.org/vocab', 'void:vocabulary'],
    ]);
  });

  it('leaves out what is loaded already, by its IRI, its version IRI or its address, with or without a trailing #', () => {
    expect(findDataOntologies([nq(RUN)], ['https://w3id.org/adiro/adiro_drawing_metadata/7.0.1#']).map((o) => o.iri)).toEqual([
      'https://w3id.org/adiro/adiro_provenance/2.2.0',
    ]);
  });

  it('falls back on the namespaces of the classes and properties when the data names no ontology, leaving out rdf, rdfs, owl and xsd', () => {
    const data = nq(
      `<https://example.org/d/a> <${TYPE}> <https://example.org/onto#Room> .\n<https://example.org/d/a> <https://example.org/onto#hasPart> <https://example.org/d/b> .\n<https://example.org/d/b> <http://www.w3.org/2000/01/rdf-schema#label> "B" .\n<https://example.org/d/b> <http://www.w3.org/2004/02/skos/core#note> "n" .\n`
    );

    expect(findDataOntologies([data], [])).toEqual([
      { iri: 'https://example.org/onto', via: 'namespace' },
      { iri: 'http://www.w3.org/2004/02/skos/core', via: 'namespace' },
    ]);
  });

  it('does not guess from namespaces when the data names ontologies that are all loaded already (#239 review)', () => {
    const data = nq(`<urn:run:1> <${PROV_USED}> <https://example.org/onto/1.0> .
<urn:x> <${TYPE}> <https://example.org/onto#Room> .
`);

    expect(findDataOntologies([data], ['https://example.org/onto/1.0'])).toEqual([]);
  });

  it('never gives a loopback, link-local or private-network address, nor a .local host, named or guessed (#239 review)', () => {
    const hosts = ['http://localhost:8080/o', 'http://127.0.0.1/o', 'http://[::1]/o', 'http://10.1.2.3/o', 'http://172.16.0.9/o', 'http://172.31.255.1/o', 'http://192.168.1.2/o', 'http://169.254.1.1/o', 'http://0.0.0.0/o', 'http://printer.local/o', 'http://[fd00::1]/o', 'http://[fe80::1]/o'];
    const named = nq(hosts.map((h) => `<urn:d> <${PROV_USED}> <${h}> .`).join(String.fromCharCode(10)) + `
<urn:d> <${PROV_USED}> <https://example.org/ok> .
<urn:d> <${PROV_USED}> <http://172.32.0.1/public> .
`);
    const guessed = nq(`<urn:x> <${TYPE}> <http://192.168.1.2/vocab#Room> .
<urn:x> <http://localhost/vocab#p> "v" .
`);

    expect(findDataOntologies([named], []).map((o) => o.iri)).toEqual(['https://example.org/ok', 'http://172.32.0.1/public']);
    expect(findDataOntologies([guessed], [])).toEqual([]);
  });

  it('gives at most ten', () => {
    const many = nq(Array.from({ length: 15 }, (_, i) => `<urn:d> <${PROV_USED}> <https://example.org/o${i}> .`).join('\n') + '\n');

    expect(findDataOntologies([many], [])).toHaveLength(10);
  });

  it('gives nothing for no data', () => {
    expect(findDataOntologies([], [])).toEqual([]);
  });
});

describe('ontologyName', () => {
  it('names an ontology by the end of its address, its version with it', () => {
    expect(ontologyName('https://w3id.org/adiro/adiro_drawing_metadata/7.0.1')).toBe('adiro_drawing_metadata 7.0.1');
    expect(ontologyName('https://example.org/onto')).toBe('onto');
  });
});

describe('dataOntologiesNote (#239: opened on their own, told in the bottom bar)', () => {
  const named = (iri: string) => ({ iri, via: 'prov:used' as const });
  const guessed = (iri: string) => ({ iri, via: 'namespace' as const });

  it('says what was read as context', () => {
    expect(dataOntologiesNote([named('https://w3id.org/adiro/adiro_drawing_metadata/7.0.1'), guessed('https://example.org/onto')], [])).toBe(
      "Read as context: adiro_drawing_metadata 7.0.1 and onto. They name the data's classes, and are never saved."
    );
  });

  it('says that what the data names could not be read, and why that may be', () => {
    expect(dataOntologiesNote([], [named('https://example.org/onto/1.0')])).toBe(
      'The data names onto 1.0, which could not be read: the address may not answer with RDF, or may not let this page read it.'
    );
  });

  it('says more quietly that a guess found nothing: the data named no ontology', () => {
    expect(dataOntologiesNote([], [guessed('http://example.org/examples/run-parts'), guessed('https://example.org/vocab')])).toBe(
      'No ontology could be read at the namespaces of its classes and properties (run-parts and vocab).'
    );
  });

  it('says nothing when nothing was tried', () => {
    expect(dataOntologiesNote([], [])).toBeNull();
  });
});
