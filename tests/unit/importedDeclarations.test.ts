/**
 * Declarations in imported ontologies (#104): when an owl:imports URL can be fetched, the properties it
 * declares are read as read-only context, so a property used but declared only in an import is known
 * (with its label, kind and range). Where an import can't be fetched, nothing changes.
 *
 * The import chain of the fixtures: properties-child-child → properties-child → properties-parent, and the
 * same for data-props-*. Fetching is faked from the fixture files, keyed by each file's ontology IRI.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadOntologyFromContent } from '../../src/lib/loadOntology';
import { getMainOntologyBase } from '../../src/parser';
import {
  getImportUrls,
  loadImportedOntologies,
  readImportedDeclarations,
  mergeImportedDeclarations,
  mergeChangesWhatIsDrawn,
} from '../../src/lib/importedDeclarations';
import type { AnnotationPropertyInfo, DataPropertyInfo, ObjectPropertyInfo } from '../../src/types';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/imported-ontology');
const fixture = (name: string) => readFileSync(join(DIR, name), 'utf-8');

/** Fixture content by ontology IRI, as a server would serve it. */
async function servedByIri(): Promise<Record<string, string>> {
  const served: Record<string, string> = {};
  for (const name of readdirSync(DIR).filter((n) => n.endsWith('.ttl'))) {
    const content = fixture(name);
    const base = getMainOntologyBase((await loadOntologyFromContent(content, name)).parseResult.store);
    if (base) served[base.replace(/#$/, '')] = content;
  }
  return served;
}

/** A fetcher that serves `served` and records what was asked for. */
function fakeFetch(served: Record<string, string>) {
  const asked: string[] = [];
  const fetchTtl = async (url: string) => {
    asked.push(url);
    return served[url.replace(/#$/, '')] ?? null;
  };
  return { fetchTtl, asked };
}

const load = async (file: string) => (await loadOntologyFromContent(fixture(file), file)).parseResult;

describe('getImportUrls', () => {
  it('lists the owl:imports of the main ontology', async () => {
    expect(getImportUrls((await load('properties-child.ttl')).store)).toEqual(['http://example.org/base']);
    expect(getImportUrls((await load('properties-parent.ttl')).store)).toEqual([]);
  });
});

describe('loadImportedOntologies', () => {
  it('reads the imports of the imports, down to the grandparent', async () => {
    const { fetchTtl, asked } = fakeFetch(await servedByIri());
    const imported = await loadImportedOntologies((await load('properties-child-child.ttl')).store, fetchTtl);

    expect(imported.map((i) => i.url).sort()).toEqual(['http://example.org/base', 'http://example.org/extended']);
    expect([...asked].sort()).toEqual(['http://example.org/base', 'http://example.org/extended']);
  });

  it('skips an import that cannot be fetched, and still reads the others', async () => {
    const served = await servedByIri();
    delete served['http://example.org/extended'];
    const { fetchTtl } = fakeFetch(served);

    expect(await loadImportedOntologies((await load('properties-child-child.ttl')).store, fetchTtl)).toEqual([]);
  });

  it('skips an import whose fetch fails or whose content is not RDF', async () => {
    const fetchTtl = async (url: string) => {
      if (url.endsWith('/base')) throw new Error('CORS');
      return 'this is not turtle at all <<<';
    };
    await expect(loadImportedOntologies((await load('properties-child.ttl')).store, fetchTtl)).resolves.toEqual([]);
  });

  it('reads each ontology once, never the main one again, even when imports form a cycle', async () => {
    const a = '@prefix owl: <http://www.w3.org/2002/07/owl#> . <http://x/a> a owl:Ontology ; owl:imports <http://x/b> .';
    const b = '@prefix owl: <http://www.w3.org/2002/07/owl#> . <http://x/b> a owl:Ontology ; owl:imports <http://x/a> .';
    const { fetchTtl, asked } = fakeFetch({ 'http://x/a': a, 'http://x/b': b });
    const main = (await loadOntologyFromContent(a, 'a.ttl')).parseResult.store;

    const imported = await loadImportedOntologies(main, fetchTtl);

    expect(imported.map((i) => i.url)).toEqual(['http://x/b']);
    expect(asked).toEqual(['http://x/b']);
  });

  it('reads an ontology imported twice at the same level once, and still reaches the ones after it', async () => {
    // main imports A and B; A imports C, B imports C and D: the second level is [C, C, D].
    const ont = (iri: string, imports: string[]) =>
      `@prefix owl: <http://www.w3.org/2002/07/owl#> . <${iri}> a owl:Ontology${imports.map((i) => ` ; owl:imports <${i}>`).join('')} .`;
    const served = {
      'http://x/a': ont('http://x/a', ['http://x/c']),
      'http://x/b': ont('http://x/b', ['http://x/c', 'http://x/d']),
      'http://x/c': ont('http://x/c', []),
      'http://x/d': ont('http://x/d', []),
    };
    const { fetchTtl, asked } = fakeFetch(served);
    const main = (await loadOntologyFromContent(ont('http://x/main', ['http://x/a', 'http://x/b']), 'main.ttl')).parseResult.store;

    // Room for exactly the four: a duplicate must not take a slot that D needs.
    const imported = await loadImportedOntologies(main, fetchTtl, { maxOntologies: 4 });

    expect(imported.map((i) => i.url).sort()).toEqual(['http://x/a', 'http://x/b', 'http://x/c', 'http://x/d']);
    expect(asked.filter((u) => u === 'http://x/c')).toHaveLength(1);
  });

  it('reads Turtle served for a URL that looks like RDF/XML (content negotiation), and the other way round', async () => {
    const turtle = '@prefix owl: <http://www.w3.org/2002/07/owl#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> . <http://x/vocab> a owl:Ontology . <http://x/vocab#p> a owl:ObjectProperty ; rdfs:label "p" .';
    const rdfXml = '<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:owl="http://www.w3.org/2002/07/owl#" xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"><owl:Ontology rdf:about="http://x/other"/><owl:ObjectProperty rdf:about="http://x/other#q"><rdfs:label>q</rdfs:label></owl:ObjectProperty></rdf:RDF>';
    const main = '@prefix owl: <http://www.w3.org/2002/07/owl#> . <http://x/main> a owl:Ontology ; owl:imports <http://x/vocab.owl> , <http://x/other> .';
    const { fetchTtl } = fakeFetch({ 'http://x/vocab.owl': turtle, 'http://x/other': rdfXml });
    const store = (await loadOntologyFromContent(main, 'main.ttl')).parseResult.store;

    const imported = await loadImportedOntologies(store, fetchTtl);

    expect(imported.map((i) => i.url).sort()).toEqual(['http://x/other', 'http://x/vocab.owl']);
    expect(readImportedDeclarations(imported).objectProperties.map((p) => p.label).sort()).toEqual(['p', 'q']);
  });

  it('stops at the depth limit', async () => {
    const { fetchTtl } = fakeFetch(await servedByIri());
    const imported = await loadImportedOntologies((await load('properties-child-child.ttl')).store, fetchTtl, { maxDepth: 1 });

    expect(imported.map((i) => i.url)).toEqual(['http://example.org/extended']);
  });

  it('stops at the limit on how many ontologies are read', async () => {
    const { fetchTtl } = fakeFetch(await servedByIri());
    const imported = await loadImportedOntologies((await load('properties-child-child.ttl')).store, fetchTtl, { maxOntologies: 1 });

    expect(imported).toHaveLength(1);
  });
});

describe('readImportedDeclarations', () => {
  it('reads object properties under their full IRI, defined by the import they come from', async () => {
    const { fetchTtl } = fakeFetch(await servedByIri());
    const imported = await loadImportedOntologies((await load('properties-child.ttl')).store, fetchTtl);

    const { objectProperties } = readImportedDeclarations(imported);

    expect(objectProperties).toHaveLength(1);
    expect(objectProperties[0]).toMatchObject({
      name: 'http://example.org/base#hasProperty',
      uri: 'http://example.org/base#hasProperty',
      label: 'has property',
      isDefinedBy: 'http://example.org/base',
    });
  });

  it('reads data properties with their label, range and domain, defined by the import (even when it does not say so)', async () => {
    const { fetchTtl } = fakeFetch(await servedByIri());
    const imported = await loadImportedOntologies((await load('data-props-child.ttl')).store, fetchTtl);

    const { dataProperties } = readImportedDeclarations(imported);

    // data-props-parent.ttl gives :identifier no rdfs:isDefinedBy.
    expect(dataProperties.find((p) => p.name === 'identifier')).toMatchObject({
      uri: 'http://example.org/data-base#identifier',
      label: 'identifier',
      range: 'http://www.w3.org/2001/XMLSchema#string',
      domains: ['BaseEntity'],
      isDefinedBy: 'http://example.org/data-base',
    });
    expect(dataProperties.find((p) => p.name === 'createdDate')?.label).toBe('created date');
  });
});

describe('mergeImportedDeclarations', () => {
  const empty = { objectProperties: [], dataProperties: [], annotationProperties: [] };
  const op = (o: Partial<ObjectPropertyInfo> & { name: string }): ObjectPropertyInfo => ({ label: o.name, hasCardinality: true, ...o });
  const dp = (o: Partial<DataPropertyInfo> & { name: string }): DataPropertyInfo => ({ label: o.name, range: null, domains: [], hasGlobalDomain: false, ...o });
  const ap = (o: Partial<AnnotationPropertyInfo> & { name: string }): AnnotationPropertyInfo => ({ isBoolean: false, ...o });

  it('adds a property declared only in an import, as context only: listed, never drawn', () => {
    const imported = {
      ...empty,
      objectProperties: [op({ name: 'http://example.org/base#hasProperty', uri: 'http://example.org/base#hasProperty', label: 'has property' })],
      dataProperties: [dp({ name: 'name', uri: 'http://example.org/base#name' })],
    };

    const merged = mergeImportedDeclarations({ ...empty, objectProperties: [op({ name: 'localProp' })] }, imported);

    expect(merged.objectProperties.map((p) => [p.name, p.contextOnly])).toEqual([
      ['http://example.org/base#hasProperty', true],
      ['localProp', undefined],
    ]);
    expect(merged.dataProperties.map((p) => [p.name, p.contextOnly])).toEqual([['name', true]]);
  });

  it('does not mark a property the file itself uses as context only', () => {
    const uri = 'http://example.org/data-base#identifier';
    const merged = mergeImportedDeclarations({ ...empty, dataProperties: [dp({ name: 'identifier', uri })] }, { ...empty, dataProperties: [dp({ name: 'identifier', uri })] });

    expect(merged.dataProperties[0].contextOnly).toBeUndefined();
  });

  it('fills in a stub made from usage with what the import declares, keeping what the file already says', () => {
    const uri = 'http://example.org/data-base#identifier';
    const local = { ...empty, dataProperties: [dp({ name: 'identifier', uri, label: 'identifier', comment: 'mine' })] };
    const imported = {
      ...empty,
      dataProperties: [dp({ name: 'identifier', uri, label: 'Identifier (import)', comment: 'theirs', range: 'http://www.w3.org/2001/XMLSchema#string', domains: ['BaseEntity'], isDefinedBy: 'http://example.org/data-base' })],
    };

    const [merged] = mergeImportedDeclarations(local, imported).dataProperties;

    expect(merged).toMatchObject({ comment: 'mine', range: 'http://www.w3.org/2001/XMLSchema#string', domains: ['BaseEntity'], isDefinedBy: 'http://example.org/data-base' });
  });

  it('takes the label from the import when the local entry only has its name as label', () => {
    const uri = 'http://example.org/base#hasProperty';
    const local = { ...empty, objectProperties: [op({ name: uri, label: 'hasProperty' })] };
    const imported = { ...empty, objectProperties: [op({ name: uri, uri, label: 'has property', isDefinedBy: 'http://example.org/base' })] };

    const [merged] = mergeImportedDeclarations(local, imported).objectProperties;

    expect(merged).toMatchObject({ label: 'has property', uri, isDefinedBy: 'http://example.org/base' });
  });

  it("does not touch a local property that shares a name with a different imported one", () => {
    const local = { ...empty, dataProperties: [dp({ name: 'name', uri: 'http://example.org/mine#name', label: 'my name' })] };
    const imported = { ...empty, dataProperties: [dp({ name: 'name', uri: 'http://example.org/base#name', label: 'their name' })] };

    const merged = mergeImportedDeclarations(local, imported).dataProperties;

    expect(merged).toEqual(local.dataProperties);
  });

  it('enriches an annotation property the file uses, but does not add the ones it does not', () => {
    const uri = 'http://example.org/core#labellableRoot';
    const local = { ...empty, annotationProperties: [ap({ name: 'labellableRoot', uri })] };
    const imported = {
      ...empty,
      annotationProperties: [
        ap({ name: 'labellableRoot', uri, range: 'http://www.w3.org/2001/XMLSchema#boolean', isBoolean: true, comment: 'Root of a labellable tree', isDefinedBy: 'http://example.org/core' }),
        ap({ name: 'unused', uri: 'http://example.org/core#unused' }),
      ],
    };

    const merged = mergeImportedDeclarations(local, imported).annotationProperties;

    expect(merged.map((p) => p.name)).toEqual(['labellableRoot']);
    expect(merged[0]).toMatchObject({ range: 'http://www.w3.org/2001/XMLSchema#boolean', isBoolean: true, comment: 'Root of a labellable tree' });
  });

  it('drops an annotation property guessed from usage when an import declares it a data or object property', () => {
    const uri = 'http://example.org/base#name';
    const local = { ...empty, annotationProperties: [ap({ name: 'name', uri }), ap({ name: 'other', uri: 'http://example.org/base#other' })] };
    const imported = { ...empty, dataProperties: [dp({ name: 'name', uri })] };

    const merged = mergeImportedDeclarations(local, imported);

    expect(merged.annotationProperties.map((p) => p.name)).toEqual(['other']);
    expect(merged.dataProperties.map((p) => p.name)).toEqual(['name']);
  });

  it('does not change its input, and returns the lists themselves when there is nothing to merge', () => {
    const local = { ...empty, objectProperties: [op({ name: 'a' })] };
    const before = JSON.stringify(local);

    expect(mergeImportedDeclarations(local, empty)).toEqual(local);
    mergeImportedDeclarations(local, { ...empty, objectProperties: [op({ name: 'http://x#b', uri: 'http://x#b' })] });
    expect(JSON.stringify(local)).toBe(before);
  });
});

describe('mergeChangesWhatIsDrawn', () => {
  const empty = { objectProperties: [], dataProperties: [], annotationProperties: [] };
  const op = (o: Partial<ObjectPropertyInfo> & { name: string }): ObjectPropertyInfo => ({ label: o.name, hasCardinality: true, ...o });
  const dp = (o: Partial<DataPropertyInfo> & { name: string }): DataPropertyInfo => ({ label: o.name, range: null, domains: [], hasGlobalDomain: false, ...o });

  it('is false when the merge only added properties as context: nothing on the canvas changes', () => {
    const local = { ...empty, objectProperties: [op({ name: 'a' })] };
    const merged = mergeImportedDeclarations(local, { ...empty, objectProperties: [op({ name: 'http://x#b', uri: 'http://x#b' })], dataProperties: [dp({ name: 'n', uri: 'http://x#n' })] });
    expect(mergeChangesWhatIsDrawn(local, merged)).toBe(false);
  });

  it('is true when the merge filled in a property the file uses: its label or range is drawn', () => {
    const uri = 'http://x#r';
    const local = { ...empty, objectProperties: [op({ name: uri, label: 'r' })] };
    const merged = mergeImportedDeclarations(local, { ...empty, objectProperties: [op({ name: uri, uri, label: 'the r' })] });
    expect(mergeChangesWhatIsDrawn(local, merged)).toBe(true);

    const dLocal = { ...empty, dataProperties: [dp({ name: 'd', uri: 'http://x#d' })] };
    const dMerged = mergeImportedDeclarations(dLocal, { ...empty, dataProperties: [dp({ name: 'd', uri: 'http://x#d', range: 'http://www.w3.org/2001/XMLSchema#string' })] });
    expect(mergeChangesWhatIsDrawn(dLocal, dMerged)).toBe(true);
  });

  it('is false when there is nothing to merge', () => {
    const local = { ...empty, objectProperties: [op({ name: 'a' })] };
    expect(mergeChangesWhatIsDrawn(local, mergeImportedDeclarations(local, empty))).toBe(false);
  });
});
