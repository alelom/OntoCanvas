/**
 * The Instances tab of the side panel (#208): browse the individuals of the open ontology and of the data added to it.
 * A class selector with the number of individuals of each, a list of the chosen class a page at a time with a search, and
 * what is known of the individual chosen. Nothing is drawn (the graph shows classes) and nothing is written.
 */

import { DataFactory, type Store } from 'n3';
import { createIndividualIndex, NO_CLASS, type DescribedLink, type DescribedTerm, type IndividualDetail, type IndividualIndex } from '../../abox/individualIndex';
import { formatTerm } from '../../sparql/formatTerm';
import { withStandardPrefixes } from '../../sparql/prefixHeader';
import { debounced } from '../../utils/debounced';
import type { SidePanelTab } from './sidePanelHost';

export interface InstancesTabDeps {
  /** The ontology's store and the stores of the data added to it. */
  getStores: () => Store[];
  /** The prefixes the open file declares. */
  getPrefixes: () => Record<string, string>;
  /** The label a class has in the graph, or null. */
  getClassLabel?: (classIri: string) => string | null;
  /** Individuals to a page; 50 by default. */
  pageSize?: number;
}

export interface InstancesTab extends SidePanelTab {
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

export function createInstancesTab(deps: InstancesTabDeps): InstancesTab {
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
      empty.textContent = 'There are no individuals in this ontology or in the data added to it. Open a file with instance data, or add a data file in the Query tab.';
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
        button.setAttribute('data-instances-item', '');
        button.append(element('span', 'instance-label', item.label ?? nameOf(item.iri)), element('span', 'instance-name', nameOf(item.iri)));
        button.title = item.iri;
        button.addEventListener('click', () => select(item.iri));
        const li = element('li');
        li.append(button);
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
      const follow = element('button', 'instance-follow', formatted.text);
      follow.type = 'button';
      follow.title = `${term.value}: show this individual`;
      follow.setAttribute('data-instances-follow', '');
      follow.addEventListener('click', () => select(term.value));
      return follow;
    }
    const span = element('span', `term-${formatted.kind}`, formatted.text);
    span.title = formatted.title;
    return span;
  }

  function renderLinks(title: string, attribute: string, links: DescribedLink[], total: number, side: 'object' | 'subject'): HTMLElement {
    const section = element('div', 'instance-links');
    section.setAttribute(attribute, '');
    section.append(element('h5', undefined, `${title} (${total})`));
    const rows = element('ul');
    for (const link of links) {
      const row = element('li');
      const property = element('span', 'instance-predicate', nameOf(link.predicate));
      property.title = link.predicate;
      row.append(
        ...(side === 'object'
          ? [property, ' ', renderTerm(link.object, link.objectIsIndividual)]
          : [renderTerm({ termType: 'NamedNode', value: link.subject }, true), ' ', property])
      );
      rows.append(row);
    }
    if (total > links.length) rows.append(element('li', 'instance-more', `…and ${total - links.length} more`));
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
    const iri = element('p', 'instance-iri', selected);
    const types = element('p', 'instance-types', described.types.length ? `Class: ${described.types.map(classTitle).join(', ')}` : 'No class');
    const otherLabels = described.labels.slice(1);
    detail.replaceChildren(
      heading,
      iri,
      types,
      ...(otherLabels.length ? [element('p', 'instance-labels', `Also labelled: ${otherLabels.join(', ')}`)] : []),
      renderLinks('Points to', 'data-instances-outgoing', described.outgoing, described.outgoingTotal, 'object'),
      renderLinks('Pointed to by', 'data-instances-incoming', described.incoming, described.incomingTotal, 'subject')
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
    container.classList.add('instances-tab');
    const note = element('p', 'query-note', 'The individuals of this ontology and of the data you added in the Query tab. They are not drawn in the graph yet.');

    classSelect = element('select');
    classSelect.setAttribute('data-instances-class', '');
    classSelect.setAttribute('aria-label', 'Class');
    searchInput = element('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Search by label or name';
    searchInput.setAttribute('aria-label', 'Search the individuals');
    searchInput.setAttribute('data-instances-search', '');

    prevButton = element('button', undefined, 'Previous');
    prevButton.type = 'button';
    prevButton.setAttribute('data-instances-prev', '');
    nextButton = element('button', undefined, 'Next');
    nextButton.type = 'button';
    nextButton.setAttribute('data-instances-next', '');
    rangeText = element('span', 'instances-range');
    rangeText.setAttribute('data-instances-range', '');
    const pager = element('div', 'instances-pager');
    pager.append(prevButton, rangeText, nextButton);

    list = element('ul', 'instances-list');
    list.setAttribute('data-instances-list', '');
    controls = element('div', 'instances-controls');
    controls.setAttribute('data-instances-controls', '');
    controls.append(classSelect, searchInput, pager, list);

    empty = element('p', 'query-note');
    empty.setAttribute('data-instances-empty', '');
    detail = element('div', 'instances-detail');
    detail.setAttribute('data-instances-detail', '');
    detail.hidden = true;

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

    container.append(note, controls, empty, detail);
    drawn = true;
    refresh();
  }

  function refresh(): void {
    if (!drawn) return;
    index = createIndividualIndex(deps.getStores());
    renderClasses();
    offset = 0;
    renderList();
    if (selected !== null && index.describe(selected).types.length === 0 && index.describe(selected).outgoingTotal === 0 && index.describe(selected).incomingTotal === 0) selected = null;
    renderDetail();
  }

  return { id: 'instances', title: 'Instances', render, refresh };
}
