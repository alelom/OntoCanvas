/**
 * The Individuals tab of the side panel (#208): browse the individuals of the open ontology and of the data added to it.
 * A class selector with the number of individuals of each, a list of the chosen class a page at a time with a search, and
 * what is known of the individual chosen. Nothing is drawn (the graph shows classes) and nothing is written.
 */

import { DataFactory, type Store } from 'n3';
import { createIndividualIndex, NO_CLASS, type DescribedLink, type DescribedTerm, type IndividualDetail, type IndividualIndex } from '../../abox/individualIndex';
import { formatTerm } from '../../sparql/formatTerm';
import { withStandardPrefixes } from '../../sparql/prefixHeader';
import { debounced } from '../../utils/debounced';
import type { DataSources } from '../../sparql/dataSources';
import type { DataLoader } from '../../sparql/dataLoader';
import type { IndividualsLayer } from '../../abox/individualsLayer';
import { createDataBlock } from './dataBlock';
import type { SidePanelTab } from './sidePanelHost';

export interface IndividualsTabDeps {
  /** The ontology's store and the stores of the data added to it. */
  getStores: () => Store[];
  /** The prefixes the open file declares. */
  getPrefixes: () => Record<string, string>;
  /** The label a class has in the graph, or null. */
  getClassLabel?: (classIri: string) => string | null;
  /** Individuals to a page; 50 by default. */
  pageSize?: number;
  /** With these, the tab has the controls to add a file or a URL of individuals, and what was added (#211). */
  dataSources?: DataSources;
  dataLoader?: DataLoader;
  /** With this, an individual can be drawn in the graph, and what is drawn is shown and cleared here (#209). */
  layer?: IndividualsLayer;
}

export interface IndividualsTab extends SidePanelTab {
  /** The ontology or the data changed: recount, and keep what is still there. */
  refresh(): void;
}

const DEFAULT_PAGE_SIZE = 50;
/** The pause after typing in the search before the list is filtered: the list is sorted on every filter. */
const SEARCH_DELAY_MS = 250;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

const toStoreTerm = (term: DescribedTerm) =>
  term.termType === 'NamedNode'
    ? DataFactory.namedNode(term.value)
    : term.termType === 'BlankNode'
      ? DataFactory.blankNode(term.value)
      : DataFactory.literal(term.value, term.language || (term.datatype ? DataFactory.namedNode(term.datatype) : undefined));

export function createIndividualsTab(deps: IndividualsTabDeps): IndividualsTab {
  const pageSize = deps.pageSize ?? DEFAULT_PAGE_SIZE;
  let index: IndividualIndex = createIndividualIndex([]);
  let drawn = false;
  let classIri: string | null = null;
  let search = '';
  let offset = 0;
  let selected: string | null = null;

  // The parts of the tab, set when it is drawn.
  let controls!: HTMLElement;
  let classSelect!: HTMLSelectElement;
  let searchInput!: HTMLInputElement;
  let list!: HTMLUListElement;
  let empty!: HTMLElement;
  let prevButton!: HTMLButtonElement;
  let nextButton!: HTMLButtonElement;
  let rangeText!: HTMLElement;
  let detail!: HTMLElement;
  let drawnLine!: HTMLElement;

  const prefixes = () => withStandardPrefixes(deps.getPrefixes());
  const nameOf = (iri: string): string => formatTerm(DataFactory.namedNode(iri), prefixes()).text;
  const classTitle = (iri: string): string => deps.getClassLabel?.(iri) ?? nameOf(iri);

  function renderClasses(): void {
    const { total, classes, withoutClass } = index.classCounts();
    const options = [new Option(`All (${total})`, '')];
    for (const entry of classes) options.push(new Option(`${classTitle(entry.classIri)} (${entry.count})`, entry.classIri));
    if (withoutClass > 0) options.push(new Option(`No class (${withoutClass})`, NO_CLASS));
    classSelect.replaceChildren(...options);
    // The class chosen stays while it has individuals; otherwise every individual.
    if (classIri !== null && !options.some((o) => o.value === classIri)) classIri = null;
    classSelect.value = classIri ?? '';
  }

  function renderList(): void {
    const { total: allTotal } = index.classCounts();
    controls.hidden = allTotal === 0;
    if (allTotal === 0) {
      list.replaceChildren();
      empty.textContent = deps.dataSources
        ? 'There are no individuals in this ontology or in the data added to it. Add a file or a URL above, or open a file that has them.'
        : 'There are no individuals in this ontology. Open a file that has them.';
      empty.hidden = false;
      rangeText.textContent = '';
      prevButton.disabled = nextButton.disabled = true;
      return;
    }
    const { items, total } = index.list({ classIri, search, offset, limit: pageSize });
    empty.hidden = total > 0;
    if (total === 0) empty.textContent = 'No individual matches.';
    list.replaceChildren(
      ...items.map((item) => {
        const button = element('button');
        button.type = 'button';
        button.setAttribute('data-individuals-item', '');
        button.append(element('span', 'individual-label', item.label ?? nameOf(item.iri)), element('span', 'individual-name', nameOf(item.iri)));
        button.title = item.iri;
        button.addEventListener('click', () => select(item.iri));
        const li = element('li');
        li.append(button, ...(deps.layer ? [graphButton(deps.layer, item.iri)] : []));
        return li;
      })
    );
    rangeText.textContent = total === 0 ? '' : `${offset + 1}–${offset + items.length} of ${total}`;
    prevButton.disabled = offset === 0;
    nextButton.disabled = offset + pageSize >= total;
  }

  function renderTerm(term: DescribedTerm, isIndividual: boolean): HTMLElement {
    const formatted = formatTerm(toStoreTerm(term), prefixes());
    if (term.termType === 'NamedNode' && isIndividual) {
      const follow = element('button', 'individual-follow', formatted.text);
      follow.type = 'button';
      follow.title = `${term.value}: show this individual`;
      follow.setAttribute('data-individuals-follow', '');
      follow.addEventListener('click', () => select(term.value));
      return follow;
    }
    const span = element('span', `term-${formatted.kind}`, formatted.text);
    span.title = formatted.title;
    return span;
  }

  function renderLinks(title: string, attribute: string, links: DescribedLink[], total: number, side: 'object' | 'subject'): HTMLElement {
    const section = element('div', 'individual-links');
    section.setAttribute(attribute, '');
    section.append(element('h5', undefined, `${title} (${total})`));
    const rows = element('ul');
    for (const link of links) {
      const row = element('li');
      const property = element('span', 'individual-predicate', nameOf(link.predicate));
      property.title = link.predicate;
      row.append(
        ...(side === 'object'
          ? [property, ' ', renderTerm(link.object, link.objectIsIndividual)]
          : [renderTerm({ termType: 'NamedNode', value: link.subject }, true), ' ', property])
      );
      rows.append(row);
    }
    if (total > links.length) rows.append(element('li', 'individual-more', `…and ${total - links.length} more`));
    section.append(rows);
    return section;
  }

  function renderDetail(): void {
    if (selected === null) {
      detail.hidden = true;
      detail.replaceChildren();
      return;
    }
    const described: IndividualDetail = index.describe(selected);
    detail.hidden = false;
    const heading = element('h4', undefined, described.labels[0] ?? nameOf(selected));
    const iri = element('p', 'individual-iri', selected);
    const types = element('p', 'individual-types', described.types.length ? `Class: ${described.types.map(classTitle).join(', ')}` : 'No class');
    const otherLabels = described.labels.slice(1);
    detail.replaceChildren(
      heading,
      iri,
      types,
      ...(otherLabels.length ? [element('p', 'individual-labels', `Also labelled: ${otherLabels.join(', ')}`)] : []),
      renderLinks('Points to', 'data-individuals-outgoing', described.outgoing, described.outgoingTotal, 'object'),
      renderLinks('Pointed to by', 'data-individuals-incoming', described.incoming, described.incomingTotal, 'subject')
    );
  }

  /** Next to an individual's row: how many of its neighbours the next click draws, and how many are drawn of all of them. */
  function graphButton(layer: IndividualsLayer, iri: string): HTMLButtonElement {
    const { shown, adds, displayed, total } = layer.preview(iri);
    const button = element('button', 'individual-graph');
    button.type = 'button';
    button.setAttribute('data-individuals-show-in-graph', '');
    if (displayed < total) {
      button.textContent = `Show ${adds} (${displayed} displayed/${total} total)`;
      button.title = shown ? `Draw ${adds} more of the neighbours of this individual` : `Draw this individual and ${adds} of its ${total} neighbours`;
      button.addEventListener('click', () => (shown ? layer.showMore(iri) : layer.show(iri)));
    } else if (!shown) {
      button.textContent = 'Show in graph';
      button.title = 'Draw this individual in the graph';
      button.addEventListener('click', () => layer.show(iri));
    } else {
      button.textContent = total > 0 ? `All ${total} displayed` : 'Shown in graph';
      button.disabled = true;
    }
    return button;
  }

  /** What is drawn in the graph: how many individuals, and Clear. */
  function renderDrawn(): void {
    const layer = deps.layer;
    if (!layer || layer.isEmpty()) {
      drawnLine.hidden = true;
      drawnLine.replaceChildren();
      return;
    }
    const view = layer.build(new Map());
    const text = element('span', undefined, `Drawn in the graph: ${view.nodes.length} individual${view.nodes.length === 1 ? '' : 's'}.${view.warning ? ` ${view.warning}` : ''}`);
    const clear = element('button', undefined, 'Clear individuals');
    clear.type = 'button';
    clear.setAttribute('data-individuals-clear', '');
    clear.addEventListener('click', () => layer.clear());
    drawnLine.hidden = false;
    drawnLine.replaceChildren(
      text,
      clear
    );
  }

  function select(iri: string): void {
    selected = iri;
    renderDetail();
  }

  const filter = debounced(() => {
    search = searchInput.value;
    offset = 0;
    renderList();
  }, SEARCH_DELAY_MS);

  function render(container: HTMLElement): void {
    container.classList.add('individuals-tab');
    const note = element('p', 'query-note', 'The individuals of this ontology and of the data added to it. A few are drawn in the graph by themselves; use the button on a row to draw that individual.');

    classSelect = element('select');
    classSelect.setAttribute('data-individuals-class', '');
    classSelect.setAttribute('aria-label', 'Class');
    searchInput = element('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Search by label or name';
    searchInput.setAttribute('aria-label', 'Search the individuals');
    searchInput.setAttribute('data-individuals-search', '');

    prevButton = element('button', undefined, 'Previous');
    prevButton.type = 'button';
    prevButton.setAttribute('data-individuals-prev', '');
    nextButton = element('button', undefined, 'Next');
    nextButton.type = 'button';
    nextButton.setAttribute('data-individuals-next', '');
    rangeText = element('span', 'individuals-range');
    rangeText.setAttribute('data-individuals-range', '');
    const pager = element('div', 'individuals-pager');
    pager.append(prevButton, rangeText, nextButton);

    list = element('ul', 'individuals-list');
    list.setAttribute('data-individuals-list', '');
    controls = element('div', 'individuals-controls');
    controls.setAttribute('data-individuals-controls', '');
    controls.append(classSelect, searchInput, pager, list);

    empty = element('p', 'query-note');
    empty.setAttribute('data-individuals-empty', '');
    detail = element('div', 'individuals-detail');
    detail.setAttribute('data-individuals-detail', '');
    detail.hidden = true;
    drawnLine = element('div', 'individuals-drawn');
    drawnLine.setAttribute('data-individuals-drawn', '');
    drawnLine.hidden = true;
    deps.layer?.onChange(() => {
      renderDrawn();
      renderList();
    });

    classSelect.addEventListener('change', () => {
      classIri = classSelect.value === '' ? null : classSelect.value;
      offset = 0;
      renderList();
    });
    searchInput.addEventListener('input', () => filter.schedule());
    prevButton.addEventListener('click', () => {
      offset = Math.max(0, offset - pageSize);
      renderList();
    });
    nextButton.addEventListener('click', () => {
      offset += pageSize;
      renderList();
    });

    const dataBlock = deps.dataSources && deps.dataLoader ? createDataBlock({ sources: deps.dataSources, loader: deps.dataLoader }) : null;
    container.append(note, ...(dataBlock ? [dataBlock] : []), drawnLine, controls, empty, detail);
    drawn = true;
    refresh();
  }

  function refresh(): void {
    if (!drawn) return;
    index = createIndividualIndex(deps.getStores());
    renderClasses();
    offset = 0;
    renderList();
    if (selected !== null) {
      // The individual chosen is gone when nothing is known of it any more.
      const known = index.describe(selected);
      if (known.types.length === 0 && known.outgoingTotal === 0 && known.incomingTotal === 0) selected = null;
    }
    renderDetail();
    renderDrawn();
  }

  return { id: 'individuals', title: 'Individuals', render, refresh };
}
