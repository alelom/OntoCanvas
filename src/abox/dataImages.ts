/**
 * The images the values of the data name (#228), for an individual's detail in the Individuals tab and its tooltip in the graph.
 * Where a value's image is depends on where the data came from:
 * - a folder (#227): the image among the folder's files (src/abox/imagePaths.ts), shown from an object URL, made when it is
 *   first shown and revoked when the folder is taken out;
 * - an address (?data=, "Add"): resolved against the data file's address;
 * - files picked on their own: the browser gives no access to the files beside them, so the path is shown with a hint.
 * An http address is itself, wherever it came from.
 */
import type { Store } from 'n3';
import type { DataSource, DataSources } from '../sparql/dataSources';
import { findInFolder, indexFolder, isImagePath, resolveAgainstUrl, type FolderIndex } from './imagePaths';
import { isPrivateAddress } from './dataOntologies';
import { runsOnWindows } from '../utils/platform';
import { forgetUrl, markNotOpenable } from '../utils/openableUrls';

/**
 * Steps that let the user see the image after all: on Windows, a browser cannot read a file whose full path is longer than 260
 * characters, so the folder is opened again from a shorter path. `folder`: the name of the folder opened.
 */
export type ImageHelp = { kind: 'long-path'; folder: string };

/** Why an image cannot be shown, and what to do about it when something can be done. */
export type ImageProblem = { hint: string; help?: ImageHelp };

/** Where a value's image is, or why it cannot be shown. */
export type ImageFound = { url: string } | ImageProblem;

/** An image of an individual kept on another individual (#241): the image individual, its value naming the image, and where it is. */
export interface LinkedImage {
  image: string;
  value: string;
  found: ImageFound;
}

export interface DataImages {
  /**
   * The image a value names, or null when it does not name one. With the individual and the property it is the value of, the
   * file that says it tells where the path starts; without them (a query result), the data file holding the value does.
   */
  find(value: string, subject?: string, predicate?: string): ImageFound | null;
  /**
   * The images of the frames an individual is drawn from, kept as ADIRO models a crop (#241): an image `geom:imageOf` the
   * individual itself, or of a frame that `geom:coversRegion` one of its `geom:hasBoundingBox`.
   */
  linkedImages(iri: string): LinkedImage[];
  /** The addresses of the images an individual's values name, and of its linked images, for its tooltip; at most `max`. */
  imagesOf(iri: string, max?: number): string[];
  /**
   * Why an image address `find` gave did not load. For a file of a folder, its bytes are read to tell a file the browser cannot
   * reach (on Windows, a path that is too long) from one that cannot be read, an empty one and one that is no image.
   */
  diagnose(url: string): Promise<ImageProblem>;
}

export const OPEN_FOLDER_HINT = "Open the data's folder (From a folder…) to see this image: a page cannot read the files beside a file picked on its own.";
const NOT_FOUND_HINT = "No file at this path in the folder opened.";
export const SEVERAL_FILES_HINT = 'This path is in several data files, each with its own image: select the individual to see the right one.';
export const PRIVATE_ADDRESS_HINT = 'Not loaded: the address is on this machine or a private network, and the data, not you, names it.';
export const NOT_FOUND_WINDOWS_HINT =
  "No file at this path in the folder opened. If the file is there, its full path may be longer than 260 characters: on Windows, the browser leaves such files out when it opens a folder.";
export const UNREADABLE_LONG_PATH_HINT = "The browser listed this image but couldn't read it. On Windows, this means its full path is longer than 260 characters.";
export const MOVED_HINT = "The browser listed this image but couldn't read it: it may have been moved, renamed or deleted since the folder was opened. Open the folder again.";
export const NOT_READABLE_HINT = "This image couldn't be read: it may be open in another program, not downloaded from the cloud yet, or not allowed to be read.";
export const EMPTY_HINT = 'This image file is empty.';
export const NOT_AN_IMAGE_HINT = "This file couldn't be shown as an image: it may be damaged, or not the kind of image its name says.";

const GEOM = 'https://w3id.org/adiro/adiro_geometry#';
const IMAGE_OF = `${GEOM}imageOf`;
const COVERS_REGION = `${GEOM}coversRegion`;
const HAS_BOUNDING_BOX = `${GEOM}hasBoundingBox`;

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

/**
 * The classes of what the image `holder` names shows, for a warning that says which images could not be loaded (#240). Followed
 * as `linkedImages` follows it, the other way: what the image is `geom:imageOf`, or the individuals with a `geom:hasBoundingBox`
 * that frame `geom:coversRegion` (a title block, for its crop). When nothing is, the class of `holder` itself.
 */
export function depictedClasses(stores: Store[], holder: string): string[] {
  const objectsOf = (subject: string, predicate: string) => stores.flatMap((s) => s.getObjects(subject, predicate, null).map((t) => t.value));
  const subjectsOf = (predicate: string, object: string) => stores.flatMap((s) => s.getSubjects(predicate, object, null).map((t) => t.value));
  const classesOf = (iris: string[]) => [...new Set(iris.flatMap((iri) => objectsOf(iri, RDF_TYPE)))];
  const frames = objectsOf(holder, IMAGE_OF);
  // What the frames cover, else the frames themselves: an image may be of an individual directly.
  const owners = frames.flatMap((frame) => objectsOf(frame, COVERS_REGION).flatMap((box) => subjectsOf(HAS_BOUNDING_BOX, box)));
  for (const shown of [owners, frames]) {
    const classes = classesOf(shown);
    if (classes.length) return classes;
  }
  return classesOf([holder]);
}

const DEFAULT_MAX_IMAGES = 4;

const dirOf = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/')));

export interface DataImagesOptions {
  sources: DataSources;
  /** The open ontology's store and where it was opened from: its own individuals' paths start there. */
  getOntology?: () => { store: Store; location: string | null } | null;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
  isWindows?: () => boolean;
}

export function createDataImages({ sources, getOntology, createUrl = (b) => URL.createObjectURL(b), revokeUrl = (u) => URL.revokeObjectURL(u), isWindows = runsOnWindows }: DataImagesOptions): DataImages {
  /** The object URL of each folder file shown, by folder and path. */
  const urls = new Map<string, string>();
  /** The file and the folder's name behind each object URL, to tell why one did not load. */
  const files = new Map<string, { blob: Blob; folder: string }>();
  const keyOf = (folder: number, path: string) => `${folder}\u0000${path}`;
  sources.onChange(() => {
    const kept = new Set(sources.folders().map((f) => f.id));
    for (const [key, url] of urls) {
      if (kept.has(Number(key.split('\u0000')[0]))) continue;
      revokeUrl(url);
      forgetUrl(url);
      urls.delete(key);
      files.delete(url);
    }
  });

  /** The values naming an image in a data file's store, read once: a data file's store does not change once added. */
  const imageValues = new WeakMap<Store, Set<string>>();
  const imageValuesOf = (store: Store): Set<string> => {
    let values = imageValues.get(store);
    if (!values) {
      values = new Set();
      for (const quad of store.getQuads(null, null, null, null)) if (isImagePath(quad.object.value)) values.add(quad.object.value);
      imageValues.set(store, values);
    }
    return values;
  };

  /** Whether the store says the value: of that individual and property, or, without an individual, of any. */
  const holds = (store: Store, value: string, subject?: string, predicate?: string): boolean =>
    subject ? store.getQuads(subject, predicate ?? null, null, null).some((q) => q.object.value === value) : imageValuesOf(store).has(value);

  /** Each folder's images indexed once, for the many values looked up in it. */
  const indexes = new WeakMap<ReadonlyMap<string, Blob>, FolderIndex>();
  const indexOf = (images: ReadonlyMap<string, Blob>): FolderIndex => {
    let index = indexes.get(images);
    if (!index) indexes.set(images, (index = indexFolder(images.keys())));
    return index;
  };

  /**
   * The image of a value in a folder: for data from a folder's file `from`, in that folder only (runs reuse their relative paths,
   * so another folder's file of the same path is another image, #240 review); otherwise in any folder.
   */
  function inFolders(value: string, from?: DataSource): string | null {
    const folders = sources.folders();
    const searched = from?.folder !== undefined ? folders.filter((f) => f.id === from.folder) : folders;
    for (const folder of searched) {
      const path = findInFolder(value, indexOf(folder.images), from?.folder === folder.id ? dirOf(from.name) : '', folder.name);
      if (!path) continue;
      const key = keyOf(folder.id, path);
      if (!urls.has(key)) {
        const blob = folder.images.get(path)!;
        const url = createUrl(blob);
        // Shown in an <img> only: opened as a page, an SVG's scripts would run as the app.
        if (blob.type === 'image/svg+xml' || /\.svg$/i.test(path)) markNotOpenable(url);
        urls.set(key, url);
        files.set(url, { blob, folder: folder.name });
      }
      return urls.get(key)!;
    }
    return null;
  }

  const allStores = (): Store[] => [...(getOntology ? [getOntology()?.store].filter((s): s is Store => !!s) : []), ...sources.stores()];

  const self: DataImages = {
    find(value, subject, predicate) {
      if (!isImagePath(value)) return null;
      const text = value.trim();
      if (/^https?:\/\//i.test(text)) return isPrivateAddress(text) ? { hint: PRIVATE_ADDRESS_HINT } : { url: text };
      const holding = sources.list().filter((s) => holds(s.store, value, subject, predicate));
      const urlIn = (source: DataSource) => (source.folder !== undefined ? inFolders(value, source) : source.url ? resolveAgainstUrl(value, source.url) : null);
      if (subject) {
        for (const source of holding) {
          const url = urlIn(source);
          if (url) return { url };
        }
      } else {
        // No individual to tell the files apart: runs reuse their relative paths, so a guess could show another run's image.
        const urls = new Set(holding.map(urlIn).filter((url): url is string => !!url));
        if (urls.size === 1) return { url: [...urls][0] };
        if (urls.size > 1) return { hint: SEVERAL_FILES_HINT };
      }
      // A file picked on its own whose folder was opened afterwards, or the ontology's own individuals; not data from a folder,
      // whose own folder was looked in.
      const anywhere = holding.some((s) => s.folder !== undefined) ? null : inFolders(value);
      if (anywhere) return { url: anywhere };
      const ontology = getOntology?.();
      if (ontology?.location && /^https?:/i.test(ontology.location) && holds(ontology.store, value, subject, predicate)) {
        const url = resolveAgainstUrl(value, ontology.location);
        if (url) return { url };
      }
      const folders = sources.folders();
      if (!folders.length) return { hint: OPEN_FOLDER_HINT };
      if (!isWindows()) return { hint: NOT_FOUND_HINT };
      // The browser leaves out of a folder the files whose path is too long, without a word: it may be one of them.
      const fromFolder = holding.find((s) => s.folder !== undefined)?.folder;
      return { hint: NOT_FOUND_WINDOWS_HINT, help: { kind: 'long-path', folder: (folders.find((f) => f.id === fromFolder) ?? folders[0]).name } };
    },
    async diagnose(url) {
      const file = files.get(url);
      if (!file) return { hint: `No image could be read at ${url}.` };
      let bytes: ArrayBuffer;
      try {
        bytes = await file.blob.arrayBuffer();
      } catch (error) {
        const name = error instanceof DOMException ? error.name : '';
        if (name === 'NotFoundError') return isWindows() ? { hint: UNREADABLE_LONG_PATH_HINT, help: { kind: 'long-path', folder: file.folder } } : { hint: MOVED_HINT };
        return { hint: NOT_READABLE_HINT };
      }
      return { hint: bytes.byteLength ? NOT_AN_IMAGE_HINT : EMPTY_HINT };
    },
    linkedImages(iri) {
      const stores = allStores();
      const subjectsOf = (predicate: string, object: string) => stores.flatMap((s) => s.getSubjects(predicate, object, null).map((t) => t.value));
      const boxes = stores.flatMap((s) => s.getObjects(iri, HAS_BOUNDING_BOX, null).map((t) => t.value));
      const frames = new Set([iri, ...boxes.flatMap((box) => subjectsOf(COVERS_REGION, box))]);
      const imageIris = new Set([...frames].flatMap((frame) => subjectsOf(IMAGE_OF, frame)));
      imageIris.delete(iri);
      const linked: LinkedImage[] = [];
      for (const image of imageIris) {
        for (const store of stores) {
          for (const quad of store.getQuads(image, null, null, null)) {
            if (!isImagePath(quad.object.value) || linked.some((l) => l.image === image && l.value === quad.object.value)) continue;
            const found = self.find(quad.object.value, image, quad.predicate.value);
            if (found) linked.push({ image, value: quad.object.value, found });
          }
        }
      }
      return linked;
    },
    imagesOf(iri, max = DEFAULT_MAX_IMAGES) {
      const found: string[] = [];
      const keep = (image: ImageFound | null) => {
        if (image && 'url' in image && found.length < max && !found.includes(image.url)) found.push(image.url);
      };
      for (const store of allStores()) {
        for (const quad of store.getQuads(iri, null, null, null)) {
          if (found.length >= max) return found;
          if (isImagePath(quad.object.value)) keep(self.find(quad.object.value, iri, quad.predicate.value));
        }
      }
      for (const linked of self.linkedImages(iri)) keep(linked.found);
      return found;
    },
  };
  return self;
}
