/**
 * Picking a local folder of data (#226, #227), for the start screen and the Individuals tab. The spike chose:
 * - the folder picker, `showDirectoryPicker()`, where the browser has it (Chrome, Edge). It asks "Let site view files?", which
 *   is what happens, and gives a handle that is kept so the folder can be reopened on a later visit with one click;
 * - elsewhere (Firefox, Safari), a file input with `webkitdirectory`. Chrome would ask "Upload N files to this site?" for it,
 *   which is wrong here (nothing leaves the computer), and is why Chrome gets the picker instead.
 * The button's tooltip says the files stay on the computer. A folder can also be dropped (src/ui/dataDrop.ts).
 */
import { folderFromHandle, folderFromInput, type DirectoryHandleLike, type FolderLister } from '../sparql/dataFolder';
import { lastFolder, mayReadFolder, onFolderRemembered, rememberFolder } from './lastFolder';
import { debugWarn } from '../utils/debug';

interface DirectoryPickerWindow {
  showDirectoryPicker?(options?: { id?: string; mode?: 'read' }): Promise<FileSystemDirectoryHandle>;
}

export const FOLDER_TOOLTIP = 'Every data file under the folder is added (compressed .gz too), and its images are kept for previews. The files stay on this computer: nothing is uploaded, and nothing is saved.';

const listerOf = (handle: FileSystemDirectoryHandle): FolderLister => (options) => folderFromHandle(handle as unknown as DirectoryHandleLike, options);

export interface FolderControls {
  /** "From a folder…" and its hidden input, used where the browser has no folder picker. */
  button: HTMLButtonElement;
  input: HTMLInputElement;
  /** "Reopen <folder>", shown when a folder was picked on an earlier visit. */
  reopen: HTMLButtonElement;
}

/** `attribute`: the prefix of the data attributes (`data-add-folder`, `data-add-folder-input`, `data-add-folder-reopen`). */
export function createFolderControls(label: string, attribute: string, onFolder: (list: FolderLister) => void): FolderControls {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.title = FOLDER_TOOLTIP;
  button.setAttribute(attribute, '');

  const input = document.createElement('input');
  input.type = 'file';
  input.webkitdirectory = true;
  input.hidden = true;
  input.setAttribute(`${attribute}-input`, '');
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length) onFolder(() => folderFromInput(files));
  });

  const reopen = document.createElement('button');
  reopen.type = 'button';
  reopen.hidden = true;
  reopen.setAttribute(`${attribute}-reopen`, '');
  let kept: FileSystemDirectoryHandle | null = null;
  const showReopen = (handle: FileSystemDirectoryHandle | null): void => {
    kept = handle;
    reopen.hidden = !handle;
    reopen.textContent = handle ? `Reopen ${handle.name}` : '';
    reopen.title = handle ? `Add the data of ${handle.name} again, as on your last visit. The browser asks first whether this page may read it.` : '';
  };
  void lastFolder().then((handle) => {
    if (!kept) showReopen(handle);
  });
  onFolderRemembered(showReopen);
  reopen.addEventListener('click', async () => {
    if (!kept) return;
    const handle = kept;
    if (await mayReadFolder(handle)) onFolder(listerOf(handle));
  });

  button.addEventListener('click', async () => {
    const picker = (window as unknown as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) return input.click();
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await picker.call(window, { id: 'ontocanvas-data', mode: 'read' });
    } catch (error) {
      // Closed without a folder (AbortError), or a folder the browser will not give (system files): it said so itself.
      debugWarn('[folderPicker] no folder', error);
      return;
    }
    void rememberFolder(handle);
    onFolder(listerOf(handle));
  });

  return { button, input, reopen };
}
