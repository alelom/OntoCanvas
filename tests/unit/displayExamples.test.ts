import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/parser';
import { appliesToClass } from '../../src/lib/dataPropertyDisplay';
import { OWL_THING_URI } from '../../src/graph/thingNode';
import { loadOntologyFromContent } from '../../src/lib/loadOntology';
import { getMainOntologyBase } from '../../src/parser';
import { importedNoteForNode } from '../../src/ui/importedNote';

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

  it('imported-note.ttl: an import with a prefix is "(defined by: base)", one without is "(imported)" (#111)', async () => {
    const content = readFileSync(join(EXAMPLES, 'display/imported-note.ttl'), 'utf-8');
    const { parseResult, extractedRefs } = await loadOntologyFromContent(content, 'imported-note.ttl');
    const mainBase = getMainOntologyBase(parseResult.store);
    const noteFor = (externalOntologyUrl: string) =>
      importedNoteForNode({ id: 'X', label: 'X', labellableRoot: null, isExternal: true, externalOntologyUrl }, extractedRefs, mainBase);
    expect(noteFor('http://example.org/examples/imported-note-base')).toBe('(defined by: base)');
    expect(noteFor('http://example.org/examples/imported-note-other')).toBe('(imported)');
    expect(importedNoteForNode({ id: 'Report', label: 'Report', labellableRoot: null, uri: 'http://example.org/examples/imported-note#Report' }, extractedRefs, mainBase)).toBeNull();
  });

  it('tooltips.ttl: Author and writes carry the comments the tooltips show (#109)', async () => {
    const { graphData, objectProperties } = await load('display/tooltips.ttl');
    expect(graphData.nodes.find((n) => n.id === 'Author')?.comment).toBe('A person who writes books.');
    expect(objectProperties.find((p) => p.name === 'writes')?.comment).toBe('The author of a book.');
  });
});
