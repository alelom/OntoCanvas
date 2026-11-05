/**
 * Starting from data files with no ontology (#234): an empty, unsaved workspace ontology is opened, a note says what it is, and
 * the files are added to it as data.
 */
import { describe, it, expect, vi } from 'vitest';
import { Parser } from 'n3';
import { exploreDataFiles, WORKSPACE_NAME, WORKSPACE_TTL } from '../../src/workflows/exploreDataFiles';

describe('exploreDataFiles', () => {
  it('opens the workspace first, then says what it is, then adds the files, in that order', async () => {
    const calls: string[] = [];
    const files = [{ name: 'a.nq', size: 1, text: async () => '' }];

    await exploreDataFiles(files, {
      openOntology: async (ttl, name) => void calls.push(`open ${name} ${ttl === WORKSPACE_TTL}`),
      showNote: (text) => void calls.push(`note ${text}`),
      addDataFiles: async (added) => void calls.push(`add ${added.map((f) => f.name).join(',')}`),
    });

    expect(calls[0]).toBe(`open ${WORKSPACE_NAME} true`);
    expect(calls[1]).toMatch(/^note .*no ontology.*offers to open them.*clears the data/i);
    expect(calls[2]).toBe('add a.nq');
  });

  it('does not add the files when the workspace could not be opened', async () => {
    const addDataFiles = vi.fn();

    await expect(
      exploreDataFiles([], {
        openOntology: async () => {
          throw new Error('broken');
        },
        showNote: () => {},
        addDataFiles,
      })
    ).rejects.toThrow('broken');

    expect(addDataFiles).not.toHaveBeenCalled();
  });

  it('the workspace is a valid, empty ontology with a label, and no classes', () => {
    const quads = new Parser().parse(WORKSPACE_TTL);

    expect(quads.some((q) => q.object.value === 'http://www.w3.org/2002/07/owl#Ontology')).toBe(true);
    expect(quads.some((q) => q.object.value === 'http://www.w3.org/2002/07/owl#Class')).toBe(false);
    expect(quads.find((q) => q.predicate.value.endsWith('#label'))?.object.value).toBe('Data files, no ontology');
  });
});
