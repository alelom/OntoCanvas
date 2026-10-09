import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/parser';
import { appliesToClass } from '../../src/lib/dataPropertyDisplay';
import { OWL_THING_URI } from '../../src/graph/thingNode';

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

  it('tooltips.ttl: Author and writes carry the comments the tooltips show (#109)', async () => {
    const { graphData, objectProperties } = await load('display/tooltips.ttl');
    expect(graphData.nodes.find((n) => n.id === 'Author')?.comment).toBe('A person who writes books.');
    expect(objectProperties.find((p) => p.name === 'writes')?.comment).toBe('The author of a book.');
  });
});
