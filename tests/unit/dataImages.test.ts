/**
 * The images the values of the data name (#228): from the folder the data came from, against the address it was downloaded from,
 * or a hint for files picked on their own; object URLs made once and revoked when the folder is taken out.
 */
import { describe, it, expect, vi } from 'vitest';
import { Parser, Store } from 'n3';
import { createDataSources } from '../../src/sparql/dataSources';
import { createDataImages, OPEN_FOLDER_HINT } from '../../src/abox/dataImages';

const NS = 'http://example.org/d#';
const PATH = 'runs/run-0001/images/page-1/titleblock.png';
const turtle = `@prefix : <${NS}> .\n:sheet1 a :Sheet ; :imagePath "${PATH}" ; :label "Sheet 1" .\n`;
const file = (name: string) => ({ name, size: turtle.length, text: async () => turtle });

function setUp() {
  const sources = createDataSources();
  let next = 0;
  const createUrl = vi.fn(() => `blob:${++next}`);
  const revokeUrl = vi.fn();
  return { sources, createUrl, revokeUrl, images: createDataImages({ sources, createUrl, revokeUrl }) };
}

describe('createDataImages', () => {
  it('finds the image of a value in the folder the data came from, by an object URL made once', async () => {
    const { sources, images, createUrl } = setUp();
    const blob = new Blob(['png']);
    const folder = sources.addFolder('run-0001', new Map([['images/page-1/titleblock.png', blob]]), 0);
    await sources.addFile(file('part-0001.ttl'), { name: 'part-0001.ttl', folder: folder.id });

    expect(images.find(PATH, `${NS}sheet1`, `${NS}imagePath`)).toEqual({ url: 'blob:1' });
    expect(images.find(PATH, `${NS}sheet1`, `${NS}imagePath`)).toEqual({ url: 'blob:1' });
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(createUrl).toHaveBeenCalledWith(blob);
  });

  it('revokes the object URLs of a folder taken out', async () => {
    const { sources, images, revokeUrl } = setUp();
    const folder = sources.addFolder('run-0001', new Map([['images/page-1/titleblock.png', new Blob()]]), 0);
    await sources.addFile(file('part-0001.ttl'), { name: 'part-0001.ttl', folder: folder.id });
    images.find(PATH);

    sources.removeFolder(folder.id);

    expect(revokeUrl).toHaveBeenCalledWith('blob:1');
  });

  it("resolves a path against the address of the data file it is in, without the folders they share", async () => {
    const { sources, images } = setUp();
    const fetch = vi.fn(async () => new Response(turtle, { headers: { 'content-type': 'text/turtle' } }));
    await sources.addUrl('https://example.org/data/runs/run-0001/part-0001.ttl', { fetch });

    expect(images.find(PATH, `${NS}sheet1`, `${NS}imagePath`)).toEqual({ url: 'https://example.org/data/runs/run-0001/images/page-1/titleblock.png' });
  });

  it('gives a hint for a file picked on its own: the page cannot read the files beside it', async () => {
    const { sources, images } = setUp();
    await sources.addFile(file('part-0001.ttl'));

    expect(images.find(PATH, `${NS}sheet1`, `${NS}imagePath`)).toEqual({ hint: OPEN_FOLDER_HINT });
  });

  it('keeps an http address, and gives nothing for a value that names no image', () => {
    const { images } = setUp();

    expect(images.find('https://img.example.org/a.png')).toEqual({ url: 'https://img.example.org/a.png' });
    expect(images.find('Sheet 1')).toBeNull();
  });

  it("gives an individual's images for its tooltip, and none when the path is not found", async () => {
    const { sources, images } = setUp();
    const folder = sources.addFolder('run-0001', new Map([['images/page-1/titleblock.png', new Blob()]]), 0);
    await sources.addFile(file('part-0001.ttl'), { name: 'part-0001.ttl', folder: folder.id });

    expect(images.imagesOf(`${NS}sheet1`)).toEqual(['blob:1']);
    expect(images.imagesOf(`${NS}nobody`)).toEqual([]);
  });

  it("reads the ontology's own individuals against where it was opened from", () => {
    const store = new Store(new Parser().parse(turtle));
    const sources = createDataSources();
    const images = createDataImages({ sources, getOntology: () => ({ store, location: 'https://example.org/data/runs/run-0001/onto.ttl' }) });

    expect(images.find(PATH, `${NS}sheet1`, `${NS}imagePath`)).toEqual({ url: 'https://example.org/data/runs/run-0001/images/page-1/titleblock.png' });
  });
});
