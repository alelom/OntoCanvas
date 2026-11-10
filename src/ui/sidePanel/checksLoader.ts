/**
 * Where a library of checks is loaded (#230, #231): files, a folder, or an address (a manifest, a query or shapes). The same
 * control in the Query tab and the Checks tab, both loading into the one library: a manifest gives each tab its half.
 */
import { describeOutcome, type ChecksLibrary, type LoadOutcome, type PickedFile } from '../../checks/checksLibrary';

const ACCEPT = '.rq,.sparql,.json,.ttl,.turtle,.trig,.nt,.shacl';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

const asPicked = (files: FileList, folder: boolean): PickedFile[] =>
  [...files].map((file) => ({ path: (folder && file.webkitRelativePath) || file.name, text: () => file.text() }));

/** The control, with a status line saying what the last load did. */
export function renderChecksLoader(library: ChecksLibrary, options: { label: string }): HTMLElement {
  const box = element('div', 'checks-loader');
  box.setAttribute('data-checks-loader', '');
  const row = element('div', 'checks-loader-row');

  const filesInput = element('input');
  filesInput.type = 'file';
  filesInput.multiple = true;
  filesInput.accept = ACCEPT;
  filesInput.hidden = true;
  filesInput.setAttribute('data-checks-files-input', '');
  const folderInput = element('input');
  folderInput.type = 'file';
  folderInput.hidden = true;
  folderInput.webkitdirectory = true;
  folderInput.setAttribute('data-checks-folder-input', '');

  const button = (text: string, attribute: string, title: string): HTMLButtonElement => {
    const b = element('button', undefined, text);
    b.type = 'button';
    b.title = title;
    b.setAttribute(attribute, '');
    return b;
  };
  const filesButton = button('Files…', 'data-checks-files', 'Queries (.rq), SHACL shapes (Turtle), or a manifest (.json) with the files it lists');
  const folderButton = button('Folder…', 'data-checks-folder', 'A folder of checks: what its manifest.json lists, or else its .rq files and its shapes (*.shacl.ttl, *shapes*.ttl)');
  filesButton.addEventListener('click', () => filesInput.click());
  folderButton.addEventListener('click', () => folderInput.click());

  const address = element('input', 'checks-address');
  address.type = 'url';
  address.placeholder = 'https://…/manifest.json';
  address.setAttribute('aria-label', 'Address of a manifest, a query or shapes');
  address.setAttribute('data-checks-address', '');
  const loadAddress = button('Load', 'data-checks-load-address', 'Load the manifest, query or shapes at this address');

  const status = element('div', 'query-note checks-loader-status');
  status.setAttribute('data-checks-loader-status', '');
  status.setAttribute('aria-live', 'polite');

  async function load(work: () => Promise<LoadOutcome>): Promise<void> {
    status.textContent = 'Loading…';
    for (const b of [filesButton, folderButton, loadAddress]) b.disabled = true;
    try {
      const outcome = await work();
      status.textContent = describeOutcome(outcome);
      status.title = outcome.problems.join('\n');
    } finally {
      for (const b of [filesButton, folderButton, loadAddress]) b.disabled = false;
    }
  }

  filesInput.addEventListener('change', () => {
    if (!filesInput.files?.length) return;
    const picked = asPicked(filesInput.files, false);
    filesInput.value = '';
    void load(() => library.addFiles(picked));
  });
  folderInput.addEventListener('change', () => {
    if (!folderInput.files?.length) return;
    const picked = asPicked(folderInput.files, true);
    folderInput.value = '';
    void load(() => library.addFiles(picked, { folder: true }));
  });
  const fromAddress = (): void => {
    const url = address.value.trim();
    if (!url) return;
    void load(() => library.addUrl(url));
  };
  loadAddress.addEventListener('click', fromAddress);
  address.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') fromAddress();
  });

  row.append(element('span', 'checks-loader-label', options.label), filesButton, folderButton, address, loadAddress, filesInput, folderInput);
  box.append(row, status);
  return box;
}
