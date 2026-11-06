/**
 * What a folder of data could not show, as a warning in the bottom bar (#240): the images its data names that it does not hold,
 * and the files the browser listed but could not open. On Windows, a path longer than 260 characters is the likely reason for a
 * file not opened and a possible one for an image missing (the browser leaves such files out without a word), so the warning
 * pops up and carries the steps to open the folder again from a shorter path.
 */
import type { DataFolder, DataSources } from '../sparql/dataSources';
import type { NoticeOptions } from './statusNotices';
import { runsOnWindows } from '../utils/platform';

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

export function folderNotice(folder: DataFolder, isWindows: boolean): ({ message: string } & NoticeOptions) | null {
  const said = [
    ...(folder.missingImages ? [`${plural(folder.missingImages, "image its data names isn't", "images its data names aren't")} in the folder`] : []),
    ...(folder.unreadable ? [`${plural(folder.unreadable, 'file or folder', 'files or folders')} couldn't be opened`] : []),
  ];
  if (!said.length) return null;
  const message = `${folder.name}: ${said.join(', and ')}.`;
  // Muted by the folder's name: the same folder opened again stays quiet, another one does not.
  const mute = { key: `folder-images:${folder.name}`, label: `this folder (${folder.name})` };
  // A file not opened is something wrong with it, wherever it is; an image missing is worth a pop-up only where it may be there.
  if (!isWindows) return { message, level: 'warning', alert: folder.unreadable > 0, mute };
  const why = folder.unreadable
    ? " On Windows, a browser can't open a file whose full path is longer than 260 characters: that is the likely reason."
    : ' If they are there, their full paths may be longer than 260 characters: on Windows, a browser leaves such files out of a folder.';
  return { message: message + why, level: 'warning', alert: true, help: { kind: 'long-path', folder: folder.name }, mute };
}

/** Keeps a notice per folder with something to say, through `setNotice`, and drops it when the folder is taken out. */
export function syncFolderNotices(
  sources: DataSources,
  setNotice: (key: string, message: string | null, options?: NoticeOptions) => void,
  isWindows: () => boolean = runsOnWindows
): void {
  let keys = new Set<string>();
  sources.onChange(() => {
    const next = new Set<string>();
    for (const folder of sources.folders()) {
      const notice = folderNotice(folder, isWindows());
      if (!notice) continue;
      const key = `folder-images:${folder.id}`;
      next.add(key);
      const { message, ...options } = notice;
      setNotice(key, message, options);
    }
    for (const key of keys) if (!next.has(key)) setNotice(key, null);
    keys = next;
  });
}
