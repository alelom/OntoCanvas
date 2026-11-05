/**
 * "Explore data files…" on the start screen (#234): for data with no ontology to open first. The button picks several files
 * at once; the start screen also takes files dropped on it (see openOntologyModal). The files are added as data to an empty,
 * unsaved workspace ontology (src/workflows/exploreDataFiles.ts).
 */

/** The data formats the picker offers first; "All files" is still there for any other name. */
export const DATA_FILE_ACCEPT = '.ttl,.nt,.nq,.trig,.jsonld,.rdf,.owl,.gz';

export function createExploreDataStart(onFiles: (files: File[]) => void): HTMLElement {
  const block = document.createElement('div');
  block.className = 'explore-data-start';

  const note = document.createElement('p');
  note.className = 'explore-data-note';
  note.textContent = 'No ontology to open? Explore data files on their own (or drop them here):';

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
    if (files.length) onFiles(files);
  });

  block.append(note, button, input);
  return block;
}
