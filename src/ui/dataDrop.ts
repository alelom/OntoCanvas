/**
 * Dropping data files onto an element (#222): the Individuals tab, and the canvas while that tab is open. A drag that carries
 * files is accepted (a drop only happens on an element that accepted the drag) and the element is marked while it is over it.
 * Anything else, or any drag while not enabled, is left to the browser.
 *
 * A folder dropped is taken as a folder (#227): every browser gives its entry (`webkitGetAsEntry`), listed when it is added. Its
 * entry must be asked for during the drop event; the browser forgets the dropped items after it.
 */
import { folderFromDroppedEntry, type DroppedEntryLike } from '../sparql/dataFolder';
import type { DataPick } from '../sparql/dataLoader';

export const DROP_ACTIVE_CLASS = 'data-drop-active';

export interface DataDropOptions {
  /** Whether a drop is taken now. */
  enabled: () => boolean;
  onDrop: (pick: DataPick) => void;
}

const carriesFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer?.types ?? []).includes('Files');

/** The files and the folders of a drop. Without items (an older browser), the files as they are. */
export function pickOfDrop(transfer: DataTransfer): DataPick {
  const items = Array.from(transfer.items ?? []).filter((item) => item.kind === 'file');
  if (!items.length) return { files: Array.from(transfer.files ?? []), folders: [] };
  const pick: DataPick = { files: [], folders: [] };
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.() as DroppedEntryLike | null | undefined;
    if (entry?.isDirectory) {
      pick.folders.push((options) => folderFromDroppedEntry(entry, options));
      continue;
    }
    const file = item.getAsFile();
    if (file) pick.files.push(file);
  }
  return pick;
}

export function attachDataDrop(target: HTMLElement, { enabled, onDrop }: DataDropOptions): void {
  const accept = (event: DragEvent): void => {
    if (!enabled() || !carriesFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    target.classList.add(DROP_ACTIVE_CLASS);
  };
  target.addEventListener('dragenter', accept);
  target.addEventListener('dragover', accept);
  target.addEventListener('dragleave', (event) => {
    // Leaving for an element inside the target is not leaving it.
    const to = event.relatedTarget;
    if (to instanceof Node && target.contains(to)) return;
    target.classList.remove(DROP_ACTIVE_CLASS);
  });
  target.addEventListener('drop', (event) => {
    target.classList.remove(DROP_ACTIVE_CLASS);
    if (!enabled() || !carriesFiles(event) || !event.dataTransfer) return;
    event.preventDefault();
    const pick = pickOfDrop(event.dataTransfer);
    if (pick.files.length || pick.folders.length) onDrop(pick);
  });
}
