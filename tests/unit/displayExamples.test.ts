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
});
