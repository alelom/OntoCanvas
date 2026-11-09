/**
 * What a folder of data could not show, as a warning in the bottom bar (#240): the images its data names that could not be
 * loaded, with the classes of what they show, and the files the browser listed but could not open. On Windows, a path longer
 * than 260 characters is the likely reason for a file not opened and a possible one for an image not loaded (the browser leaves
 * such files out without a word), so the warning pops up and carries the steps to open the folder again from a shorter path.
 */
import type { DataFolder, DataSources } from '../sparql/dataSources';
import type { NoticeOptions } from './statusNotices';
import { runsOnWindows } from '../utils/platform';

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

/** The end of a class's address: its name when the ontologies loaded give it no label. */
const localName = (iri: string): string => iri.slice(Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/')) + 1) || iri;

/** The most classes named; the others are counted. */
const MAX_CLASSES = 3;

/** ` (of class "Titleblock")`, ` (of classes "A", "B", "C" and 2 more)`, or nothing when no class is known. */
function ofClasses(classes: string[], classLabel: (iri: string) => string | null): string {
  if (!classes.length) return '';
  const names = classes.slice(0, MAX_CLASSES).map((iri) => `"${classLabel(iri) ?? localName(iri)}"`);
  if (classes.length > MAX_CLASSES) names.push(`${classes.length - MAX_CLASSES} more`);
  const listed = names.length < 2 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return ` (of ${classes.length === 1 ? 'class' : 'classes'} ${listed})`;
}

export function folderNotice(
  folder: DataFolder,
  isWindows: boolean,
  classLabel: (iri: string) => string | null = () => null
): ({ message: string } & NoticeOptions) | null {
  const { missingImages: missing, unreadable } = folder;
  if (!missing && !unreadable) return null;
  const one = missing === 1;
  const images = `${plural(missing, 'image', 'images')}${ofClasses(folder.missingImageClasses, classLabel)}`;
  const notLoaded = isWindows ? `${images} could not be loaded` : `${images} cannot be loaded from the ${one ? 'path' : 'paths'} linked in the data`;
  const said = [...(missing ? [notLoaded] : []), ...(unreadable ? [`${plural(unreadable, 'file or folder', 'files or folders')} couldn't be opened`] : [])];
  let message = `${folder.name}: ${said.join(', and ')}.`;
  // Muted by the folder's name: the same folder opened again stays quiet, another one does not.
  const mute = { key: `folder-images:${folder.name}`, label: `this folder (${folder.name})` };
  // Pops up again when the counts change, not when a class is named by its label once the ontologies are read.
  const alertKey = `${missing}:${unreadable}`;
  // A file not opened may be a data file, not only an image to preview.
  const previewOnly = unreadable ? '' : ` This only affects the preview of the ${one ? 'image' : 'images'} in OntoCanvas.`;
  // A file not opened is something wrong with it, wherever it is; an image not loaded is worth a pop-up only where it may be there.
  if (!isWindows) return { message: message + previewOnly, level: 'warning', alert: unreadable > 0, alertKey, mute };
  message += unreadable
    ? " On Windows, a browser can't open a file whose full path is longer than 260 characters: that is the likely reason."
    : ` ${one ? 'Its full path' : 'Their full paths'} may be longer than 260 characters: on Windows, a browser cannot load ${one ? 'it' : 'them'}.${previewOnly}`;
  return { message, level: 'warning', alert: true, alertKey, help: { kind: 'long-path', folder: folder.name }, mute };
}

export interface FolderNoticeOptions {
  isWindows?: () => boolean;
  /** A class's label in the ontologies loaded, if it has one. */
  classLabel?: (iri: string) => string | null;
}

/**
 * Keeps a notice per folder with something to say, through `setNotice`, and drops it when the folder is taken out. Gives back a
 * function that says them again: the labels of the classes are known once the ontologies the data names are read.
 */
export function syncFolderNotices(
  sources: DataSources,
  setNotice: (key: string, message: string | null, options?: NoticeOptions) => void,
  { isWindows = runsOnWindows, classLabel }: FolderNoticeOptions = {}
): () => void {
  let keys = new Set<string>();
  const sync = () => {
    const next = new Set<string>();
    for (const folder of sources.folders()) {
      const notice = folderNotice(folder, isWindows(), classLabel);
      if (!notice) continue;
      const key = `folder-images:${folder.id}`;
      next.add(key);
      const { message, ...options } = notice;
      setNotice(key, message, options);
    }
    for (const key of keys) if (!next.has(key)) setNotice(key, null);
    keys = next;
  };
  sources.onChange(sync);
  return sync;
}
