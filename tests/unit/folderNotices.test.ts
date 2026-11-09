/**
 * A folder's images it could not see, said in the bottom bar (#240): the images its data names that could not be loaded, with
 * the classes of what they show, and the files the browser could not open. On Windows a path longer than 260 characters is the
 * likely or possible reason, so the warning pops up and carries the steps to open the folder from a shorter path.
 */
import { describe, it, expect } from 'vitest';
import { folderNotice, syncFolderNotices } from '../../src/ui/folderNotices';
import { createDataSources, type DataFolder } from '../../src/sparql/dataSources';

const NS = 'http://example.org/d#';
/** The pop-up is muted per folder, by its name: the same folder opened again stays quiet. */
const MUTE = { key: 'folder-images:run-0001', label: 'this folder (run-0001)' };
const folder = (missingImages: number, unreadable: number, classes: string[] = [`${NS}Titleblock`]): DataFolder => ({
  id: 1,
  name: 'run-0001',
  images: new Map(),
  skipped: 0,
  missingImages,
  missingImageClasses: missingImages ? classes : [],
  unreadable,
});

describe('folderNotice', () => {
  it('says nothing of a folder that showed everything', () => {
    expect(folderNotice(folder(0, 0), true)).toBeNull();
  });

  it('on Windows, images not loaded only: of which class, a long path is possible, only the preview is affected; it pops up with the steps', () => {
    expect(folderNotice(folder(13, 0), true)).toEqual({
      message:
        'run-0001: 13 images (of class "Titleblock") could not be loaded. Their full paths may be longer than 260 characters: on Windows, a browser cannot load them. This only affects the preview of the images in OntoCanvas.',
      level: 'warning',
      alert: true,
      alertKey: '13:0',
      help: { kind: 'long-path', folder: 'run-0001' },
      mute: MUTE,
    });
  });

  it('says one image in the singular', () => {
    expect(folderNotice(folder(1, 0), true)!.message).toBe(
      'run-0001: 1 image (of class "Titleblock") could not be loaded. Its full path may be longer than 260 characters: on Windows, a browser cannot load it. This only affects the preview of the image in OntoCanvas.'
    );
  });

  it("names a class by the label it has in the ontologies loaded, else by the end of its address; several, and many, in short", () => {
    const label = (iri: string) => (iri === `${NS}DrawingSheet` ? 'Drawing Sheet' : null);
    expect(folderNotice(folder(2, 0, [`${NS}Titleblock`, `${NS}DrawingSheet`]), false, label)!.message).toContain('(of classes "Titleblock" and "Drawing Sheet")');
    const many = ['A', 'B', 'C', 'D', 'E'].map((c) => NS + c);
    expect(folderNotice(folder(5, 0, many), false)!.message).toContain('(of classes "A", "B", "C" and 2 more)');
    expect(folderNotice(folder(2, 0, []), false)!.message).toBe('run-0001: 2 images cannot be loaded from the paths linked in the data. This only affects the preview of the images in OntoCanvas.');
  });

  it('on Windows, files it could not open: a long path is the likely reason, and they may be data files, not only previews', () => {
    expect(folderNotice(folder(1, 2), true)!.message).toBe(
      'run-0001: 1 image (of class "Titleblock") could not be loaded, and 2 files or folders couldn\'t be opened. On Windows, a browser can\'t open a file whose full path is longer than 260 characters: that is the likely reason.'
    );
  });

  it('elsewhere, images not loaded only: from the paths linked in the data, a plain warning, no pop-up and no steps', () => {
    expect(folderNotice(folder(13, 0), false)).toEqual({
      message: 'run-0001: 13 images (of class "Titleblock") cannot be loaded from the paths linked in the data. This only affects the preview of the images in OntoCanvas.',
      level: 'warning',
      alert: false,
      alertKey: '13:0',
      mute: MUTE,
    });
    expect(folderNotice(folder(1, 0), false)!.message).toContain('1 image (of class "Titleblock") cannot be loaded from the path linked in the data.');
  });

  it('elsewhere, files it could not open still pop up: something is wrong with them', () => {
    expect(folderNotice(folder(0, 1), false)).toEqual({ message: "run-0001: 1 file or folder couldn't be opened.", level: 'warning', alert: true, alertKey: '0:1', mute: MUTE });
  });
});

describe('syncFolderNotices', () => {
  it("sets a notice per folder with something to say, and drops it with the folder", async () => {
    const sources = createDataSources();
    const set: Array<[string, string | null]> = [];
    syncFolderNotices(sources, (key, message) => set.push([key, message]), { isWindows: () => true });

    const run = sources.addFolder('run-0001', new Map(), 0, 1);
    await sources.addFile({ name: 'a.ttl', size: 10, text: async () => '<http://e/a> <http://e/p> "x" .' }, { name: 'a.ttl', folder: run.id });
    expect(set.at(-1)).toEqual([`folder-images:${run.id}`, expect.stringContaining("1 file or folder couldn't be opened")]);

    sources.removeFolder(run.id);
    expect(set.at(-1)).toEqual([`folder-images:${run.id}`, null]);
  });

  it('says it again, with the labels known by then, when asked: once the ontologies the data names are read', () => {
    const sources = createDataSources();
    const set: Array<[string, string | null]> = [];
    let labels: Record<string, string> = {};
    const refresh = syncFolderNotices(sources, (key, message) => set.push([key, message]), { isWindows: () => false, classLabel: (iri) => labels[iri] ?? null });

    const run = sources.addFolder('run-0001', new Map(), 0);
    sources.setMissingImages(run.id, 2, [`${NS}DrawingSheet`]);
    expect(set.at(-1)![1]).toContain('(of class "DrawingSheet")');

    labels = { [`${NS}DrawingSheet`]: 'Drawing Sheet' };
    refresh();
    expect(set.at(-1)![1]).toContain('(of class "Drawing Sheet")');
  });
});
