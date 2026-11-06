/**
 * A folder's images it could not see, said in the bottom bar (#240): the images its data names that it does not hold, and the
 * files the browser could not open. On Windows a path longer than 260 characters is the likely or possible reason, so the
 * warning pops up and carries the steps to open the folder from a shorter path.
 */
import { describe, it, expect } from 'vitest';
import { folderNotice, syncFolderNotices } from '../../src/ui/folderNotices';
import { createDataSources, type DataFolder } from '../../src/sparql/dataSources';

/** The pop-up is muted per folder, by its name: the same folder opened again stays quiet. */
const MUTE = { key: 'folder-images:run-0001', label: 'this folder (run-0001)' };
const folder = (missingImages: number, unreadable: number): DataFolder => ({ id: 1, name: 'run-0001', images: new Map(), skipped: 0, missingImages, unreadable });

describe('folderNotice', () => {
  it('says nothing of a folder that showed everything', () => {
    expect(folderNotice(folder(0, 0), true)).toBeNull();
  });

  it('on Windows, images missing only: a long path is possible, a warning that pops up, with the steps', () => {
    expect(folderNotice(folder(13, 0), true)).toEqual({
      message: "run-0001: 13 images its data names aren't in the folder. If they are there, their full paths may be longer than 260 characters: on Windows, a browser leaves such files out of a folder.",
      level: 'warning',
      alert: true,
      help: { kind: 'long-path', folder: 'run-0001' },
      mute: MUTE,
    });
  });

  it('on Windows, files it could not open: a long path is the likely reason', () => {
    expect(folderNotice(folder(1, 2), true)!.message).toBe(
      "run-0001: 1 image its data names isn't in the folder, and 2 files or folders couldn't be opened. On Windows, a browser can't open a file whose full path is longer than 260 characters: that is the likely reason."
    );
  });

  it('elsewhere, images missing only: a plain warning, no pop-up and no steps', () => {
    expect(folderNotice(folder(13, 0), false)).toEqual({ message: "run-0001: 13 images its data names aren't in the folder.", level: 'warning', alert: false, mute: MUTE });
  });

  it('elsewhere, files it could not open still pop up: something is wrong with them', () => {
    expect(folderNotice(folder(0, 1), false)).toEqual({ message: "run-0001: 1 file or folder couldn't be opened.", level: 'warning', alert: true, mute: MUTE });
  });
});

describe('syncFolderNotices', () => {
  it("sets a notice per folder with something to say, and drops it with the folder", async () => {
    const sources = createDataSources();
    const set: Array<[string, string | null]> = [];
    syncFolderNotices(sources, (key, message) => set.push([key, message]), () => true);

    const run = sources.addFolder('run-0001', new Map(), 0, 1);
    await sources.addFile({ name: 'a.ttl', size: 10, text: async () => '<http://e/a> <http://e/p> "x" .' }, { name: 'a.ttl', folder: run.id });
    expect(set.at(-1)).toEqual([`folder-images:${run.id}`, expect.stringContaining("1 file or folder couldn't be opened")]);

    sources.removeFolder(run.id);
    expect(set.at(-1)).toEqual([`folder-images:${run.id}`, null]);
  });
});
