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

/** Where a value's image is, or why it cannot be shown. */
export type ImageFound = { url: string } | { hint: string };

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
}

export const OPEN_FOLDER_HINT = "Open the data's folder (From a folder…) to see this image: a page cannot read the files beside a file picked on its own.";
const NOT_FOUND_HINT = "No file at this path in the folder opened.";
export const SEVERAL_FILES_HINT = 'This path is in several data files, each with its own image: select the individual to see the right one.';
export const PRIVATE_ADDRESS_HINT = 'Not loaded: the address is on this machine or a private network, and the data, not you, names it.';

const GEOM = 'https://w3id.org/adiro/adiro_geometry#';
const IMAGE_OF = `${GEOM}imageOf`;
const COVERS_REGION = `${GEOM}coversRegion`;
const HAS_BOUNDING_BOX = `${GEOM}hasBoundingBox`;

const DEFAULT_MAX_IMAGES = 4;

const dirOf = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/')));

export interface DataImagesOptions {
  sources: DataSources;
  /** The open ontology's store and where it was opened from: its own individuals' paths start there. */
  getOntology?: () => { store: Store; location: string | null } | null;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
}

export function createDataImages({ sources, getOntology, createUrl = (b) => URL.createObjectURL(b), revokeUrl = (u) => URL.revokeObjectURL(u) }: DataImagesOptions): DataImages {
  /** The object URL of each folder file shown, by folder and path. */
  const urls = new Map<string, string>();
  const keyOf = (folder: number, path: string) => `${folder}\u0000${path}`;
  sources.onChange(() => {
    const kept = new Set(sources.folders().map((f) => f.id));
    for (const [key, url] of urls) {
      if (kept.has(Number(key.split('\u0000')[0]))) continue;
      revokeUrl(url);
      urls.delete(key);
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

  /** The image of a value in a folder, for data from the file `from` (its path in the folder), or in any folder. */
  function inFolders(value: string, from?: DataSource): string | null {
    const folders = sources.folders();
    const ordered = from?.folder !== undefined ? [...folders.filter((f) => f.id === from.folder), ...folders.filter((f) => f.id !== from.folder)] : folders;
    for (const folder of ordered) {
      const path = findInFolder(value, indexOf(folder.images), from?.folder === folder.id ? dirOf(from.name) : '', folder.name);
      if (!path) continue;
      const key = keyOf(folder.id, path);
      if (!urls.has(key)) urls.set(key, createUrl(folder.images.get(path)!));
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
      // A file picked on its own whose folder was opened afterwards, or the ontology's own individuals.
      const anywhere = inFolders(value);
      if (anywhere) return { url: anywhere };
      const ontology = getOntology?.();
      if (ontology?.location && /^https?:/i.test(ontology.location) && holds(ontology.store, value, subject, predicate)) {
        const url = resolveAgainstUrl(value, ontology.location);
        if (url) return { url };
      }
      return { hint: sources.folders().length ? NOT_FOUND_HINT : OPEN_FOLDER_HINT };
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
