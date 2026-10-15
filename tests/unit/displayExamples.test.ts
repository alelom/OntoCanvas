import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/parser';
import { appliesToClass } from '../../src/lib/dataPropertyDisplay';
import { OWL_THING_URI } from '../../src/graph/thingNode';
import { loadOntologyFromContent } from '../../src/lib/loadOntology';
import { getMainOntologyBase } from '../../src/parser';
import { importedNoteForNode, importedNoteForRelationship } from '../../src/ui/importedNote';
import { expandWithExternalRefs } from '../../src/graph/externalExpansion';
import { annotationUsedOnClass, annotationUsedAnywhere } from '../../src/ui/propertyMenuFacts';
import { stylingOrder } from '../../src/lib/annotationStyle';

const EXAMPLES = join(dirname(fileURLToPath(import.meta.url)), '../../examples');
const load = (path: string) => parseRdfToGraph(readFileSync(join(EXAMPLES, path), 'utf-8'), { path });

/** The examples' header comments promise what the canvas shows; keep them true. */
describe('examples/display', () => {
  it('thing-data-properties.ttl: name and homepage under owl:Thing, age on Person, nick free-standing (#80)', async () => {
    const { dataProperties } = await load('display/thing-data-properties.ttl');
    const under = (classId: string, cluster: boolean) =>
      dataProperties.filter((dp) => appliesToClass(dp, classId, cluster)).map((dp) => dp.name).sort();
    expect(under(OWL_THING_URI, true)).toEqual(['homepage', 'name']);
    expect(under('Person', true)).toEqual(['age']);
    expect(under('Document', false)).toEqual(['homepage', 'name']);
    expect(dataProperties.find((dp) => dp.name === 'nick')).toMatchObject({ domains: [], hasGlobalDomain: false });
  });

  it('imported-note.ttl: Document, Person and author are defined by base, Template by an unprefixed import, Report is local (#111)', async () => {
    const content = readFileSync(join(EXAMPLES, 'display/imported-note.ttl'), 'utf-8');
    const { parseResult, extractedRefs } = await loadOntologyFromContent(content, 'imported-note.ttl');
    const mainBase = getMainOntologyBase(parseResult.store);
    // The imported classes and the relationship to them are added when the graph is expanded for display.
    const expanded = expandWithExternalRefs(parseResult.graphData, parseResult.store, extractedRefs, {
      displayExternalReferences: true,
      externalNodeLayout: 'auto',
    });
    const BASE = 'http://example.org/examples/imported-note-base#';
    const OTHER = 'http://example.org/examples/imported-note-other#';
    const node = (id: string) => {
      const found = expanded.nodes.find((n) => n.id === id);
      expect(found, `the example has a node ${id}`).toBeDefined();
      return found!;
    };

    expect(importedNoteForNode(node('Report'), extractedRefs, mainBase)).toBeNull();
    expect(importedNoteForNode(node(BASE + 'Document'), extractedRefs, mainBase)).toBe('(defined by: base)');
    expect(importedNoteForNode(node(BASE + 'Person'), extractedRefs, mainBase)).toBe('(defined by: base)');
    expect(importedNoteForNode(node(OTHER + 'Template'), extractedRefs, mainBase)).toBe('(defined by: imported-note-other)');

    // Report ⊑ ∃ base:author . base:Person: the relationship is drawn, with the same note.
    const author = expanded.edges.find((e) => e.type === BASE + 'author');
    expect(author, 'the example has an author relationship').toMatchObject({ from: 'Report', to: BASE + 'Person' });
    expect(importedNoteForRelationship(author!.type, parseResult.objectProperties, extractedRefs, mainBase)).toBe('(defined by: base)');
  });

  it('tooltips.ttl: Author and writes carry the comments the tooltips show (#109)', async () => {
    const { graphData, objectProperties } = await load('display/tooltips.ttl');
    expect(graphData.nodes.find((n) => n.id === 'Author')?.comment).toBe('A person who writes books.');
    expect(objectProperties.find((p) => p.name === 'writes')?.comment).toBe('The author of a book.');
  });

  it('menu-groups.ttl: oldLabelFlag is deprecated and styles nothing though on a class; spareNote is used nowhere; isLabel and skos:altLabel are on classes, the rest not (#137)', async () => {
    const { store, annotationProperties } = await load('display/menu-groups.ttl');
    expect(annotationProperties.filter((p) => p.deprecated).map((p) => p.name)).toEqual(['oldLabelFlag']);
    const NS = 'http://example.org/examples/menu-groups#';
    const used = (uri: string) => annotationUsedOnClass(store, uri);
    expect(used(`${NS}isLabel`)).toBe(true);
    expect(used('http://www.w3.org/2004/02/skos/core#altLabel')).toBe(true);
    expect(used(`${NS}oldLabelFlag`)).toBe(true);
    expect(stylingOrder(annotationProperties)).not.toContain('oldLabelFlag');
    expect(annotationUsedAnywhere(store, `${NS}spareNote`)).toBe(false);
    expect(used('http://purl.org/dc/terms/title')).toBe(false);
    expect(used('http://purl.org/dc/terms/license')).toBe(false);
    expect(used('http://www.w3.org/2004/02/skos/core#definition')).toBe(false);
  });
});

describe('examples/display/example-images.ttl (#142)', () => {
  const OPENED_FROM = 'https://example.org/repo/examples/display/example-images.ttl';
  const IMAGES = 'https://example.org/repo/examples/display/exampleImage/';
  const opened = async () => {
    const content = readFileSync(join(EXAMPLES, 'display/example-images.ttl'), 'utf-8');
    return (await loadOntologyFromContent(content, OPENED_FROM)).parseResult;
  };
  const files = (images: string[] | undefined) => (images ?? []).map((u) => u.replace(IMAGES, ''));

  it('opened by URL, its relative images resolve next to it, in order, on classes, the relationship and the data property', async () => {
    const { graphData, objectProperties, dataProperties } = await opened();
    const node = (id: string) => graphData.nodes.find((n) => n.id === id);
    expect(files(node('Widget')?.exampleImages)).toEqual(['Widget_01.png', 'Widget_02.png', 'Widget_03.png']);
    expect(files(node('Gadget')?.exampleImages)).toEqual(['Gadget_01.png']);
    expect(node('Sprocket')?.comment).toBeUndefined();
    expect(files(node('Sprocket')?.exampleImages)).toEqual(['Sprocket_01.png', 'Sprocket_02.png']);
    expect(node('Plain')?.exampleImages).toBeUndefined();
    expect(files(objectProperties.find((p) => p.name === 'hasPart')?.exampleImages)).toEqual(['hasPart_01.png', 'hasPart_02.png']);
    expect(files(dataProperties.find((p) => p.name === 'weight')?.exampleImages)).toEqual(['weight_01.png']);
  });

  it('every image it names exists next to it, except the missing one it demonstrates', async () => {
    const { graphData, objectProperties, dataProperties } = await opened();
    const named = [...graphData.nodes, ...objectProperties, ...dataProperties].flatMap((t) => files(t.exampleImages));
    const missing = named.filter((f) => {
      try {
        readFileSync(join(EXAMPLES, 'display/exampleImage', f));
        return false;
      } catch {
        return true;
      }
    });
    expect(missing).toEqual(['Gizmo_01.png']);
  });
});
