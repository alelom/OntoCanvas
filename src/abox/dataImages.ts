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
import { findInFolder, isImagePath, resolveAgainstUrl } from './imagePaths';

/** Where a value's image is, or why it cannot be shown. */
export type ImageFound = { url: string } | { hint: string };

export interface DataImages {
  /**
   * The image a value names, or null when it does not name one. With the individual and the property it is the value of, the
   * file that says it tells where the path starts.
   */
  find(value: string, subject?: string, predicate?: string): ImageFound | null;
  /** The addresses of the images an individual's values name, for its tooltip; at most `max`. */
  imagesOf(iri: string, max?: number): string[];
}

export const OPEN_FOLDER_HINT = "Open the data's folder (From a folder…) to see this image: a page cannot read the files beside a file picked on its own.";
const NOT_FOUND_HINT = "No file at this path in the folder opened.";

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

  const holds = (store: Store, value: string, subject?: string, predicate?: string): boolean =>
    !subject || store.getQuads(subject, predicate ?? null, null, null).some((q) => q.object.value === value);

  /** The image of a value in a folder, for data from the file `from` (its path in the folder), or in any folder. */
  function inFolders(value: string, from?: DataSource): string | null {
    const folders = sources.folders();
    const ordered = from?.folder !== undefined ? [...folders.filter((f) => f.id === from.folder), ...folders.filter((f) => f.id !== from.folder)] : folders;
    for (const folder of ordered) {
      const path = findInFolder(value, new Set(folder.images.keys()), from?.folder === folder.id ? dirOf(from.name) : '', folder.name);
      if (!path) continue;
      const key = keyOf(folder.id, path);
      if (!urls.has(key)) urls.set(key, createUrl(folder.images.get(path)!));
      return urls.get(key)!;
    }
    return null;
  }

  const self: DataImages = {
    find(value, subject, predicate) {
      if (!isImagePath(value)) return null;
      if (/^https?:\/\//i.test(value.trim())) return { url: value.trim() };
      const holding = sources.list().filter((s) => holds(s.store, value, subject, predicate));
      for (const source of holding) {
        const url = source.folder !== undefined ? inFolders(value, source) : source.url ? resolveAgainstUrl(value, source.url) : null;
        if (url) return { url };
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
    imagesOf(iri, max = DEFAULT_MAX_IMAGES) {
      const stores = [...(getOntology ? [getOntology()?.store].filter((s): s is Store => !!s) : []), ...sources.stores()];
      const found: string[] = [];
      for (const store of stores) {
        for (const quad of store.getQuads(iri, null, null, null)) {
          if (found.length >= max) return found;
          const image = isImagePath(quad.object.value) ? self.find(quad.object.value, iri, quad.predicate.value) : null;
          if (image && 'url' in image && !found.includes(image.url)) found.push(image.url);
        }
      }
      return found;
    },
  };
  return self;
}
