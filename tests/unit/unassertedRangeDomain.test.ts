/**
 * Parser-level tests for https://github.com/alelom/OntoCanvas/issues/25.
 *
 * The fixture is the ADIRO provenance ontology exactly as pinned in the report
 * (commit 4fd2c7ebcf5d5801dafab679fd6d3c8328178548). Its PROV-O terms are deliberate typing
 * stubs: declared as names only, with their axioms left at the source. The parser must record
 * that absence rather than substitute a default.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph, getDataProperties } from '../../src/parser';
import { XSD_NS, RDFS_NS } from '../../src/lib/dataPropertyDisplay';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STUBS_FIXTURE = join(__dirname, '../fixtures/aec-provenance-typing-stubs.ttl');
const INHERITED_FIXTURE = join(__dirname, '../fixtures/inherited-range-subproperty.ttl');

async function dataPropsOf(fixture: string) {
  const content = readFileSync(fixture, 'utf-8');
  const { store } = await parseRdfToGraph(content, { path: fixture });
  return getDataProperties(store);
}

describe('unasserted rdfs:range', () => {
  it('records no range for a typing stub that declares none', async () => {
    const props = await dataPropsOf(STUBS_FIXTURE);

    const generatedAtTime = props.find((p) => p.name === 'generatedAtTime');
    expect(generatedAtTime).toBeDefined();
    expect(generatedAtTime!.range).toBeNull();
    // PROV-O's real range is xsd:dateTime, so guessing xsd:string was actively misleading.
    expect(generatedAtTime!.range).not.toBe(XSD_NS + 'string');
  });

  it('still records ranges that are asserted, including rdfs:Literal', async () => {
    const props = await dataPropsOf(STUBS_FIXTURE);

    expect(props.find((p) => p.name === 'capturedCaption')!.range).toBe(XSD_NS + 'string');
    expect(props.find((p) => p.name === 'hasConfidence')!.range).toBe(XSD_NS + 'decimal');
    expect(props.find((p) => p.name === 'inferredAt')!.range).toBe(XSD_NS + 'dateTime');
    expect(props.find((p) => p.name === 'hasLiteralValue')!.range).toBe(RDFS_NS + 'Literal');
  });
});

describe('unasserted rdfs:domain', () => {
  it('marks a stub with no domain as neither global nor attached to a class', async () => {
    const props = await dataPropsOf(STUBS_FIXTURE);

    const generatedAtTime = props.find((p) => p.name === 'generatedAtTime')!;
    expect(generatedAtTime.domains).toEqual([]);
    expect(generatedAtTime.hasGlobalDomain).toBe(false);
  });

  it('keeps asserted domains intact', async () => {
    const props = await dataPropsOf(STUBS_FIXTURE);

    expect(props.find((p) => p.name === 'capturedCaption')!.domains).toEqual(['FieldAssertion']);
    expect(props.find((p) => p.name === 'inferredAt')!.domains).toEqual(['InferenceMeta']);
  });

  it('distinguishes an asserted owl:Thing domain from no domain at all', async () => {
    const ttl = `
@prefix : <http://example.org/thing#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Ontology rdf:type owl:Ontology .
:Thing1 rdf:type owl:Class .

:global rdf:type owl:DatatypeProperty ; rdfs:domain owl:Thing ; rdfs:range xsd:string .
:silent rdf:type owl:DatatypeProperty ; rdfs:range xsd:string .
`;
    const { store } = await parseRdfToGraph(ttl, { path: 'thing.ttl' });
    const props = getDataProperties(store);

    const global = props.find((p) => p.name === 'global')!;
    expect(global.domains).toEqual([]);
    expect(global.hasGlobalDomain).toBe(true);

    const silent = props.find((p) => p.name === 'silent')!;
    expect(silent.domains).toEqual([]);
    expect(silent.hasGlobalDomain).toBe(false);
  });
});

describe('range inherited through rdfs:subPropertyOf', () => {
  it('resolves a range from a super-property declared in the same document', async () => {
    const props = await dataPropsOf(INHERITED_FIXTURE);

    const loggedAt = props.find((p) => p.name === 'loggedAt')!;
    expect(loggedAt.range).toBeNull();
    expect(loggedAt.inheritedRange).toEqual({ range: XSD_NS + 'dateTime', from: 'timestamp' });
  });

  it('follows the subPropertyOf chain more than one level', async () => {
    const props = await dataPropsOf(INHERITED_FIXTURE);

    const recordedAt = props.find((p) => p.name === 'recordedAt')!;
    expect(recordedAt.range).toBeNull();
    expect(recordedAt.inheritedRange).toEqual({ range: XSD_NS + 'dateTime', from: 'timestamp' });
  });

  it('infers nothing when no ancestor declares a range', async () => {
    const props = await dataPropsOf(INHERITED_FIXTURE);

    expect(props.find((p) => p.name === 'orphan')!.inheritedRange).toBeNull();
    // The super-property lives in PROV-O, which is not loaded; resolving it would need a fetch.
    expect(props.find((p) => p.name === 'externallyTyped')!.inheritedRange).toBeNull();
  });

  it('leaves inheritedRange unset when the property asserts its own range', async () => {
    const props = await dataPropsOf(INHERITED_FIXTURE);

    const timestamp = props.find((p) => p.name === 'timestamp')!;
    expect(timestamp.range).toBe(XSD_NS + 'dateTime');
    expect(timestamp.inheritedRange).toBeNull();
  });

  it('terminates on a subPropertyOf cycle', async () => {
    const ttl = `
@prefix : <http://example.org/cycle#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology .
:a rdf:type owl:DatatypeProperty ; rdfs:subPropertyOf :b .
:b rdf:type owl:DatatypeProperty ; rdfs:subPropertyOf :a .
`;
    const { store } = await parseRdfToGraph(ttl, { path: 'cycle.ttl' });
    const props = getDataProperties(store);

    expect(props.find((p) => p.name === 'a')!.inheritedRange).toBeNull();
    expect(props.find((p) => p.name === 'b')!.inheritedRange).toBeNull();
  });
});
