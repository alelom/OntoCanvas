/**
 * The controls to add individuals to the open ontology, in the Individuals tab (#205, moved from the Query tab in #211): a
 * file or a URL, the progress with Cancel, why a file was not added, what was added with a Remove button, a notice when a
 * dataset split into numbered parts is added only in part (#225), and the named graphs of the data with a checkbox each (#224).
 * The reading is the data loader's, so the Query tab can show the same status; this only draws it.
 */
import type { Store } from 'n3';
import type { DataSource, DataSources } from '../../sparql/dataSources';
import type { DataLoader } from '../../sparql/dataLoader';
import { findPartGroups, partsNotice } from '../../sparql/numberedParts';

export interface DataBlockDeps {
  sources: DataSources;
  loader: DataLoader;
  /** Where else a graph's label may be stated: the ontology (#224). */
  getLabelStores?: () => Store[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function createDataBlock({ sources, loader, getLabelStores }: DataBlockDeps): HTMLElement {
  const block = element('div', 'query-data');
  block.setAttribute('data-query-data', '');

  const addFile = element('button', undefined, 'From a file…');
  addFile.type = 'button';
  addFile.title = 'Add the individuals of one or more files (or drop the files on this tab or the graph). They are never saved.';
  addFile.setAttribute('data-add-file', '');
  const fileInput = element('input');
  fileInput.type = 'file';
  fileInput.multiple = true;
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

  // A dataset split into numbered parts, added only in part (#225): which parts seem to be missing, across everything added.
  // Dismissed, it stays hidden until what it says changes.
  const parts = element('div', 'query-data-parts');
  parts.hidden = true;
  parts.setAttribute('data-data-parts', '');
  const partsText = element('span');
  const addParts = element('button', undefined, 'Add files…');
  addParts.type = 'button';
  addParts.setAttribute('data-data-parts-add', '');
  addParts.addEventListener('click', () => fileInput.click());
  const dismissParts = element('button', undefined, 'Dismiss');
  dismissParts.type = 'button';
  dismissParts.setAttribute('data-data-parts-dismiss', '');
  parts.append(partsText, addParts, dismissParts);
  let dismissed: string | null = null;
  const renderParts = (): void => {
    const notice = partsNotice(findPartGroups(sources.list().map((s) => s.name)));
    parts.hidden = !notice || notice.text === dismissed;
    parts.classList.toggle('strong', !!notice?.strong);
    partsText.textContent = notice?.text ?? '';
  };
  dismissParts.addEventListener('click', () => {
    dismissed = partsText.textContent;
    parts.hidden = true;
  });

  // The named graphs of the data (#224), one row per graph across the sources, each with a checkbox that hides or shows its
  // statements in the list, the counts and the drawn individuals. Queries keep every graph.
  const graphs = element('div', 'query-data-graphs');
  graphs.hidden = true;
  graphs.setAttribute('data-data-graphs', '');
  const renderGraphs = (): void => {
    const listed = sources.graphs(getLabelStores?.() ?? []);
    graphs.hidden = listed.length === 0;
    if (!listed.length) return graphs.replaceChildren();
    const heading = element('div', 'query-note', 'Graphs (unticked ones are left out of the list and the graph; queries see them all)');
    graphs.replaceChildren(
      heading,
      ...listed.map((graph) => {
        const box = element('input');
        box.type = 'checkbox';
        box.checked = !sources.isGraphHidden(graph.key);
        box.addEventListener('change', () => sources.setGraphHidden(graph.key, !box.checked));
        const row = element('label', 'query-data-graph');
        row.setAttribute('data-data-graph', '');
        row.title = graph.iri ?? 'The statements in no named graph';
        row.append(box, `${graph.label ?? graph.iri ?? 'Default graph'} — ${plural(graph.quads, 'quad', 'quads')}`);
        return row;
      })
    );
  };

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
  sources.onChange(renderGraphs);
  sources.onChange(renderParts);
  loader.onChange(renderStatus);
  renderList();
  renderGraphs();
  renderParts();
  renderStatus();

  addFile.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const picked = Array.from(fileInput.files ?? []);
    fileInput.value = '';
    if (picked.length) void loader.addFiles(picked);
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

  block.append(adders, progress, list, parts, graphs);
  return block;
}
