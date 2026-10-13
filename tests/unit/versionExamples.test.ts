import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadOntologyFromContent } from '../../src/lib/loadOntology';
import { readOntologyVersion, versionLabel } from '../../src/lib/ontologyVersion';
import { findVersions, type VersionSources } from '../../src/lib/ontologyVersions';

const EXAMPLES = join(dirname(fileURLToPath(import.meta.url)), '../../examples');
/** Where the examples are opened from: their relative IRIs resolve against it. */
const WHERE = 'https://examples.test/versions/';
const OFFLINE: VersionSources = {
  fetchText: async () => null,
  fetchJson: async () => null,
  exists: async () => false,
  parse: async () => null,
};

async function open(file: string) {
  const content = readFileSync(join(EXAMPLES, 'versions', file), 'utf-8');
  const { parseResult } = await loadOntologyFromContent(content, WHERE + file);
  const store = parseResult.store;
  return { label: versionLabel(readOntologyVersion(store)), found: await findVersions(store, WHERE + file, OFFLINE) };
}

/** The examples' header comments promise what the bottom bar shows; keep them true. */
describe('examples/versions', () => {
  it('building-2.0.0.ttl: v2.0.0, and a list of 2.0.0, 1.1.0 and 1.0.0 that opens the files next to it (#130, #132, #133)', async () => {
    const { label, found } = await open('building-2.0.0.ttl');
    expect(label).toBe('2.0.0');
    expect(found.entries.map((e) => [e.version, e.source])).toEqual([['2.0.0', 'loaded'], ['1.1.0', 'prior'], ['1.0.0', 'prior']]);
    expect(found.entries[1].url).toBe(`${WHERE}building-1.1.0.ttl`);
    expect(found.newer).toBeNull();
  });

  it('building-1.1.0.ttl offers 1.0.0; building-1.0.0.ttl offers no list', async () => {
    expect((await open('building-1.1.0.ttl')).found.entries.map((e) => e.version)).toEqual(['1.1.0', '1.0.0']);
    expect((await open('building-1.0.0.ttl')).found.entries.map((e) => e.version)).toEqual(['1.0.0']);
  });
});
