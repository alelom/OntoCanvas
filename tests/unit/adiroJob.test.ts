/**
 * A job folder of compressed N-Quads (#251): examples/datasets/adiro-job, a tree with a folder per run, a part-0001 in each,
 * and the merged parts of a finished run. Opened as a folder, every part is a source of its own, in its own named graph, and
 * the same part name in several folders is not a gap in a numbered series. Made-up data, read from the example files.
 */
import { describe, it, expect, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from 'n3';
import { folderFromHandle, folderSummary, type DirectoryHandleLike } from '../../src/sparql/dataFolder';
import { createDataLoader } from '../../src/sparql/dataLoader';
import { createDataSources } from '../../src/sparql/dataSources';
import { findPartGroups, partsNotice } from '../../src/sparql/numberedParts';

const JOB = join(__dirname, '../../examples/datasets/adiro-job/job');

/** A directory on disk as the handle a folder picker gives. */
function handleOf(path: string, name: string): DirectoryHandleLike {
  return {
    kind: 'directory',
    name,
    async *values() {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const child = join(path, entry.name);
        if (entry.isDirectory()) yield handleOf(child, entry.name);
        else yield { kind: 'file', name: entry.name, getFile: async () => new File([readFileSync(child)], entry.name) };
      }
    },
  };
}

const PARTS = ['compacted/part-0001.nq.gz', 'runs/run-a/part-0001.nq.gz', 'runs/run-a/part-0002.nq.gz', 'runs/run-b/part-0001.nq.gz'];

async function openJob() {
  const sources = createDataSources();
  const loader = createDataLoader({ sources, getStore: () => new Store(), confirm: vi.fn().mockResolvedValue(true) });
  await loader.addFolder((options) => folderFromHandle(handleOf(JOB, 'job'), options));
  return { sources, loader };
}

describe('a job folder', () => {
  it('lists every part under the runs and compacted folders as data, and keeps its images; the metadata is skipped', async () => {
    const contents = await folderFromHandle(handleOf(JOB, 'job'));

    expect(contents.data.map((f) => f.path)).toEqual(PARTS);
    expect(contents.images.map((f) => f.path)).toEqual(['images/run-a/crop-1.png']);
    expect(contents.skipped).toBe(2);
    expect(folderSummary(contents, 4)).toBe('Added 4 data files from job; 1 image kept for previews; 2 other files skipped.');
  });

  it('adds each part as a source of its own, named by its path, with nothing left to say', async () => {
    const { sources, loader } = await openJob();

    expect(sources.list().map((s) => s.name)).toEqual(PARTS);
    expect(sources.list().every((s) => s.folder !== undefined)).toBe(true);
    expect(loader.status()).toMatch(/^Added 4 data files from job/);
  });

  it('lists the named graph of each run; the quads of a finished run held again in its compacted part are counted again', async () => {
    const { sources } = await openJob();

    const graphs = sources.graphs().map((g) => [g.iri, g.quads]);
    // run-a: 28 + 23 quads in its two parts, and the same 51 in compacted/.

    expect(graphs).toEqual([
      ['urn:example:job:run-a', 51 + 51],
      ['urn:example:job:run-b', 51],
    ]);
  });

  it('does not take the same part name in several folders for a gap in a numbered series', async () => {
    const { sources } = await openJob();
    const names = sources.list().map((s) => s.name);

    const notice = partsNotice(findPartGroups(names, new Set(names)));

    expect(notice).toBeNull();
  });

  it('still tells a gap inside one run folder', () => {
    const names = ['runs/run-a/part-0001.nq.gz', 'runs/run-a/part-0003.nq.gz', 'runs/run-b/part-0001.nq.gz'];

    const notice = partsNotice(findPartGroups(names, new Set(names)));

    expect(notice?.strong).toBe(true);
    expect(notice?.text).toContain('part 2');
  });
});
