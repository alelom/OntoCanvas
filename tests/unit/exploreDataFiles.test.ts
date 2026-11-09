/**
 * Starting from data files with no ontology (#234): an empty, unsaved workspace ontology is opened, a note says what it is, and
 * the files are added to it as data.
 */
import { describe, it, expect, vi } from 'vitest';
import { Parser } from 'n3';
import { exploreDataFiles, WORKSPACE_IRI, WORKSPACE_NAME, WORKSPACE_NOTE, WORKSPACE_TTL } from '../../src/workflows/exploreDataFiles';

describe('exploreDataFiles', () => {
  it('opens the workspace first, then says what it is, then adds the files, in that order', async () => {
    const calls: string[] = [];
    const files = [{ name: 'a.nq', size: 1, text: async () => '' }];

    await exploreDataFiles({ files, folders: [] }, {
      openOntology: async (ttl, name) => void calls.push(`open ${name} ${ttl === WORKSPACE_TTL}`),
      showNote: (text) => void calls.push(`note ${text}`),
      addData: async (added) => void calls.push(`add ${added.files.map((f) => f.name).join(',')}`),
    });

    expect(calls[0]).toBe(`open ${WORKSPACE_NAME} true`);
    expect(calls[1]).toBe(`note ${WORKSPACE_NOTE}`);
    expect(calls[2]).toBe('add a.nq');
  });

  it('does not add the files when the workspace could not be opened', async () => {
    const addData = vi.fn();

    await expect(
      exploreDataFiles({ files: [], folders: [] }, {
        openOntology: async () => {
          throw new Error('broken');
        },
        showNote: () => {},
        addData,
      })
    ).rejects.toThrow('broken');

    expect(addData).not.toHaveBeenCalled();
  });

  it('the workspace is a valid, empty ontology with a label, and no classes', () => {
    const quads = new Parser().parse(WORKSPACE_TTL);

    expect(quads.some((q) => q.object.value === 'http://www.w3.org/2002/07/owl#Ontology')).toBe(true);
    expect(quads.some((q) => q.object.value === 'http://www.w3.org/2002/07/owl#Class')).toBe(false);
    expect(quads.find((q) => q.predicate.value.endsWith('#label'))?.object.value).toBe('Data files, no ontology');
  });
});

describe('the note (#240)', () => {
  it('says no ontology is open, and how to see the individuals in their full context; the note on the data ontologies says the rest', () => {
    expect(WORKSPACE_NOTE).toBe(
      'Exploring data files with no ontology open. Open an ontology first, and the data after it, to see the individuals in their full ontology context.'
    );
  });

  it('the workspace is told apart by its IRI', () => {
    const quads = new Parser().parse(WORKSPACE_TTL);
    expect(quads[0].subject.value).toBe(WORKSPACE_IRI);
  });
});
