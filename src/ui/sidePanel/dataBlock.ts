/**
 * The controls to add individuals to the open ontology, in the Individuals tab (#205, moved from the Query tab in #211): a
 * file or a URL, the progress with Cancel, why a file was not added, and what was added with a Remove button. The reading is
 * the data loader's, so the Query tab can show the same status; this only draws it.
 */
import type { DataSource, DataSources } from '../../sparql/dataSources';
import type { DataLoader } from '../../sparql/dataLoader';

export interface DataBlockDeps {
  sources: DataSources;
  loader: DataLoader;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function createDataBlock({ sources, loader }: DataBlockDeps): HTMLElement {
  const block = element('div', 'query-data');
  block.setAttribute('data-query-data', '');

  const addFile = element('button', undefined, 'From a file…');
  addFile.type = 'button';
  addFile.title = 'Add the individuals of a file. They are not drawn and never saved.';
  addFile.setAttribute('data-add-file', '');
  const fileInput = element('input');
  fileInput.type = 'file';
  fileInput.hidden = true;
  fileInput.setAttribute('data-add-file-input', '');
  const urlInput = element('input');
  urlInput.type = 'url';
  urlInput.placeholder = 'or a data URL (https://…)';
  urlInput.setAttribute('aria-label', 'Data URL');
  urlInput.setAttribute('data-add-url-input', '');
  const addUrl = element('button', undefined, 'Add');
  addUrl.type = 'button';
  addUrl.setAttribute('data-add-url', '');
  const adders = element('div', 'query-data-add');
  adders.append(addFile, fileInput, urlInput, addUrl);

  const status = element('span', 'query-status');
  status.setAttribute('data-data-status', '');
  status.setAttribute('aria-live', 'polite');
  const cancel = element('button', undefined, 'Cancel');
  cancel.type = 'button';
  cancel.hidden = true;
  cancel.setAttribute('data-data-cancel', '');
  const progress = element('div', 'query-data-status');
  progress.append(status, cancel);

  const list = element('ul', 'query-data-list');
  list.hidden = true;
  list.setAttribute('data-data-list', '');

  const renderList = (): void => {
    const added = sources.list();
    list.hidden = added.length === 0;
    list.replaceChildren(
      ...added.map((source: DataSource) => {
        const remove = element('button', undefined, 'Remove');
        remove.type = 'button';
        remove.title = 'Take these individuals out of the queries and the list';
        remove.setAttribute('data-data-remove', '');
        remove.addEventListener('click', () => sources.remove(source.id));
        const item = element('li');
        item.append(element('span', undefined, `${source.name} — ${plural(source.triples, 'triple', 'triples')}`), remove);
        return item;
      })
    );
  };
  const renderStatus = (): void => {
    status.textContent = loader.status();
    cancel.hidden = !loader.loading();
  };
  sources.onChange(renderList);
  loader.onChange(renderStatus);
  renderList();
  renderStatus();

  addFile.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const picked = fileInput.files?.[0];
    fileInput.value = '';
    if (picked) void loader.addFile(picked);
  });
  const submitUrl = (): void => {
    const url = urlInput.value.trim();
    if (!url) return;
    urlInput.value = '';
    void loader.addUrl(url);
  };
  addUrl.addEventListener('click', submitUrl);
  urlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submitUrl();
  });
  cancel.addEventListener('click', () => loader.cancel());

  block.append(adders, progress, list);
  return block;
}
