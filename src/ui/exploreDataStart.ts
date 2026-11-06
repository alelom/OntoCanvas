/**
 * "Explore data files…" on the start screen (#234): for data with no ontology to open first. The button picks several files
 * at once, "Explore a folder…" a whole folder (#227), "Reopen <folder>" the folder of the last visit, and the block takes files
 * and folders dropped on it. The data is added to an empty, unsaved workspace ontology (src/workflows/exploreDataFiles.ts).
 */
import { attachDataDrop } from './dataDrop';
import { createFolderControls } from './folderPicker';
import type { DataPick } from '../sparql/dataLoader';

/** The data formats the picker offers first; "All files" is still there for any other name. */
export const DATA_FILE_ACCEPT = '.ttl,.nt,.nq,.trig,.jsonld,.rdf,.owl,.gz';

export function createExploreDataStart(onPick: (pick: DataPick) => void): HTMLElement {
  const block = document.createElement('div');
  block.className = 'explore-data-start';

  const note = document.createElement('p');
  note.className = 'explore-data-note';
  note.textContent = 'No ontology to open? Explore data files or a folder of them on their own, or drop them on this box:';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Explore data files…';
  button.title = 'Add individuals from one or more data files (compressed .gz too), with no ontology. They are never saved.';
  button.setAttribute('data-explore-data', '');

  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = DATA_FILE_ACCEPT;
  input.hidden = true;
  input.setAttribute('data-explore-data-input', '');

  button.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length) onPick({ files, folders: [] });
  });

  const folder = createFolderControls('Explore a folder…', 'data-explore-folder', (list) => onPick({ files: [], folders: [list] }));

  // Only this block takes a drop: the rest of the dialog is about opening an ontology, and an ontology dropped there must not
  // become data in an empty workspace (#238 review).
  attachDataDrop(block, { enabled: () => true, onDrop: onPick });

  block.append(note, button, input, folder.button, folder.input, folder.reopen);
  return block;
}
