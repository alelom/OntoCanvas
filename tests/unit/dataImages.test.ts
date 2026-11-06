/**
 * The images the values of the data name (#228): from the folder the data came from, against the address it was downloaded from,
 * or a hint for files picked on their own; object URLs made once and revoked when the folder is taken out.
 */
import { describe, it, expect, vi } from 'vitest';
import { Parser, Store } from 'n3';
import { createDataSources } from '../../src/sparql/dataSources';
import {
  createDataImages,
  EMPTY_HINT,
  MOVED_HINT,
  NOT_AN_IMAGE_HINT,
  NOT_FOUND_WINDOWS_HINT,
  NOT_READABLE_HINT,
  OPEN_FOLDER_HINT,
  PRIVATE_ADDRESS_HINT,
  SEVERAL_FILES_HINT,
  UNREADABLE_LONG_PATH_HINT,
} from '../../src/abox/dataImages';

const NS = 'http://example.org/d#';
const PATH = 'runs/run-0001/images/page-1/titleblock.png';
const turtle = `@prefix : <${NS}> .\n:sheet1 a :Sheet ; :imagePath "${PATH}" ; :label "Sheet 1" .\n`;
const file = (name: string) => ({ name, size: turtle.length, text: async () => turtle });

function setUp() {
  const sources = createDataSources();
  let next = 0;
  const createUrl = vi.fn(() => `blob:${++next}`);
  const revokeUrl = vi.fn();
  return { sources, createUrl, revokeUrl, images: createDataImages({ sources, createUrl, revokeUrl, isWindows: () => false }) };
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

  it('without an individual (a query result), takes the data file holding the value, not the first one listed (#240 review)', async () => {
    const { sources, images } = setUp();
    const other = `@prefix : <${NS}> .\n:sheet9 :imagePath "images/z/titleblock.png" .\n`;
    const fetch = vi.fn(async () => new Response(other, { headers: { 'content-type': 'text/turtle' } }));
    await sources.addUrl('https://example.org/runs/r1/part-0001.ttl', { fetch });
    const folder = sources.addFolder('run-0001', new Map([['images/page-1/titleblock.png', new Blob()]]), 0);
    await sources.addFile(file('part-0001.ttl'), { name: 'part-0001.ttl', folder: folder.id });

    expect(images.find(PATH)).toEqual({ url: 'blob:1' });
  });

  it('without an individual, shows nothing when two data files hold the value and its image differs between them', async () => {
    const { sources, images } = setUp();
    const fetch = vi.fn(async () => new Response(turtle, { headers: { 'content-type': 'text/turtle' } }));
    await sources.addUrl('https://example.org/runs/r1/part-0001.ttl', { fetch });
    const folder = sources.addFolder('run-0001', new Map([['images/page-1/titleblock.png', new Blob()]]), 0);
    await sources.addFile(file('part-0001.ttl'), { name: 'part-0001.ttl', folder: folder.id });

    expect(images.find(PATH)).toEqual({ hint: SEVERAL_FILES_HINT });
    // With the individual, the file that says it decides as before.
    expect(images.find(PATH, `${NS}sheet1`, `${NS}imagePath`)).toEqual({ url: 'https://example.org/runs/r1/runs/run-0001/images/page-1/titleblock.png' });
  });

  it('does not load an image address on this machine or a private network, written in the data (#240 review)', () => {
    const { images } = setUp();

    expect(images.find('http://localhost:8080/a.png')).toEqual({ hint: PRIVATE_ADDRESS_HINT });
    expect(images.find('http://192.168.1.10/a.png')).toEqual({ hint: PRIVATE_ADDRESS_HINT });
    expect(images.imagesOf('http://localhost:8080/a.png')).toEqual([]);
  });

  it("indexes a folder's images once, not for every value looked up (#240 review)", async () => {
    const { sources, images } = setUp();
    const paths = new Map([['images/page-1/titleblock.png', new Blob()]]);
    const keys = vi.spyOn(paths, 'keys');
    const folder = sources.addFolder('run-0001', paths, 0);
    await sources.addFile(file('part-0001.ttl'), { name: 'part-0001.ttl', folder: folder.id });

    for (let i = 0; i < 20; i++) images.find(`images/page-${i}/missing.png`);

    expect(keys.mock.calls.length).toBeLessThanOrEqual(1);
  });

  describe('why an image cannot be shown, told apart once it fails to load', () => {
    /** A file the browser listed: its read gives these bytes, or fails with this DOMException name. */
    const listed = (read: Uint8Array | string): Blob =>
      ({ size: typeof read === 'string' ? 0 : read.length, type: 'image/png', arrayBuffer: () => (typeof read === 'string' ? Promise.reject(new DOMException('x', read)) : Promise.resolve(read.buffer)) }) as unknown as Blob;

    async function open(image: Blob, isWindows: boolean) {
      const sources = createDataSources();
      const images = createDataImages({ sources, createUrl: () => 'blob:1', isWindows: () => isWindows });
      const folder = sources.addFolder('run-0001', new Map([['images/page-1/titleblock.png', image]]), 0);
      await sources.addFile(file('part-0001.ttl'), { name: 'part-0001.ttl', folder: folder.id });
      return images;
    }

    it('on Windows, a listed file that cannot be found when read: its path is too long, with the steps for the folder opened', async () => {
      const images = await open(listed('NotFoundError'), true);
      images.find(PATH, `${NS}sheet1`, `${NS}imagePath`);

      expect(await images.diagnose('blob:1')).toEqual({ hint: UNREADABLE_LONG_PATH_HINT, help: { kind: 'long-path', folder: 'run-0001' } });
    });

    it('elsewhere, the same failure: moved or deleted since the folder was opened', async () => {
      const images = await open(listed('NotFoundError'), false);
      images.find(PATH);

      expect(await images.diagnose('blob:1')).toEqual({ hint: MOVED_HINT });
    });

    it('a file that cannot be read (open elsewhere, in the cloud only, not allowed), an empty one, and one that reads but is no image', async () => {
      for (const [image, hint] of [[listed('NotReadableError'), NOT_READABLE_HINT], [listed(new Uint8Array()), EMPTY_HINT], [listed(new Uint8Array([1, 2, 3])), NOT_AN_IMAGE_HINT]] as const) {
        const images = await open(image, true);
        images.find(PATH);

        expect(await images.diagnose('blob:1')).toEqual({ hint });
      }
    });

    it('an address it did not make (an http image): only that it could not be read there', async () => {
      const images = await open(listed(new Uint8Array([1])), true);

      expect(await images.diagnose('https://example.org/a.png')).toEqual({ hint: 'No image could be read at https://example.org/a.png.' });
    });

    it('on Windows, a path matching no file of the folder may be one the browser left out for its length: the steps come with it', async () => {
      const images = await open(listed(new Uint8Array([1])), true);

      expect(images.find('runs/run-0001/images/page-9/titleblock.png', `${NS}sheet1`)).toEqual({ hint: NOT_FOUND_WINDOWS_HINT, help: { kind: 'long-path', folder: 'run-0001' } });
    });
  });

  describe("a title block's crop, kept as ADIRO models it (#241)", () => {
    const GEOM = 'https://w3id.org/adiro/adiro_geometry#';
    const APROV = 'https://w3id.org/adiro/adiro_provenance#';
    const CROP = 'runs/r1/images/Plans%20%26%20Sections/A-101.pdf_p1.png';
    const run = `@prefix : <${NS}> . @prefix geom: <${GEOM}> . @prefix aprov: <${APROV}> .
:tb a :Titleblock ; geom:hasBoundingBox :box .
:frame geom:coversRegion :box .
:image a aprov:DrawingFile ; geom:imageOf :frame ; aprov:storageLocation "${CROP}"^^<http://www.w3.org/2001/XMLSchema#anyURI> .
:page geom:hasBoundingBox :otherBox .
`;
    async function open() {
      const { sources, images } = setUp();
      const folder = sources.addFolder('r1', new Map([['images/Plans & Sections/A-101.pdf_p1.png', new Blob()]]), 0);
      await sources.addFile({ name: 'part-0001.ttl', size: run.length, text: async () => run }, { name: 'part-0001.ttl', folder: folder.id });
      return images;
    }

    it("gives the title block the image of the frame that covers its bounding box, with the image individual it comes from", async () => {
      const images = await open();

      expect(images.linkedImages(`${NS}tb`)).toEqual([{ image: `${NS}image`, value: CROP, found: { url: 'blob:1' } }]);
      expect(images.imagesOf(`${NS}tb`)).toEqual(['blob:1']);
    });

    it('gives the frame its image too, and nothing to an individual whose box no frame covers', async () => {
      const images = await open();

      expect(images.linkedImages(`${NS}frame`).map((l) => l.image)).toEqual([`${NS}image`]);
      expect(images.linkedImages(`${NS}page`)).toEqual([]);
      // The image individual shows its own value, not itself again.
      expect(images.linkedImages(`${NS}image`)).toEqual([]);
    });
  });

  it("reads the ontology's own individuals against where it was opened from", () => {
    const store = new Store(new Parser().parse(turtle));
    const sources = createDataSources();
    const images = createDataImages({ sources, getOntology: () => ({ store, location: 'https://example.org/data/runs/run-0001/onto.ttl' }) });

    expect(images.find(PATH, `${NS}sheet1`, `${NS}imagePath`)).toEqual({ url: 'https://example.org/data/runs/run-0001/images/page-1/titleblock.png' });
  });
});
