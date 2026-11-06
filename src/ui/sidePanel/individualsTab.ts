/**
 * The Individuals tab of the side panel (#208): browse the individuals of the open ontology and of the data added to it.
 * A class selector with the number of individuals of each, a list of the chosen class a page at a time with a search, and
 * what is known of the individual chosen. Nothing is drawn (the graph shows classes) and nothing is written.
 */

import { DataFactory, type Store } from 'n3';
import { countIndividuals, createIndividualIndex, NO_CLASS, type DescribedLink, type DescribedTerm, type IndividualDetail, type IndividualIndex } from '../../abox/individualIndex';
import { formatTerm } from '../../sparql/formatTerm';
import { extractLocalName } from '../../utils/localName';
import { withStandardPrefixes } from '../../sparql/prefixHeader';
import { debounced } from '../../utils/debounced';
import type { DataSources } from '../../sparql/dataSources';
import type { GraphMatch } from '../../sparql/graphMatches';
import type { DataLoader } from '../../sparql/dataLoader';
import type { IndividualsLayer } from '../../abox/individualsLayer';
import type { DataImages, ImageFound } from '../../abox/dataImages';
import { createDataBlock } from './dataBlock';
import type { SidePanelTab } from './sidePanelHost';

export interface IndividualsTabDeps {
  /** The ontology's store and the stores of the data added to it. */
  getStores: () => Store[];
  /** The prefixes the open file declares. */
  getPrefixes: () => Record<string, string>;
  /** The label a class has in the graph, or null. */
  getClassLabel?: (classIri: string) => string | null;
  /** Rows listed at a time in a group, and drawn at a time with a button; 50 by default. */
  pageSize?: number;
  /** With these, the tab has the controls to add a file or a URL of individuals, and what was added (#211). */
  dataSources?: DataSources;
  dataLoader?: DataLoader;
  /** With this, an individual can be drawn in the graph, and what is drawn is shown and cleared here (#209). */
  layer?: IndividualsLayer;
  /** With this, a class or a property in the detail of an individual that is in the graph can be selected there (#216). `match` says what it is in the graph, or null. */
  schemaLinks?: { match: (iri: string) => GraphMatch | null; show: (match: GraphMatch) => void };
  /** The open ontology file's name (and where it was opened from, for a tooltip): the tab says how many individuals it holds itself. */
  getOntologySource?: () => { name: string; title?: string } | null;
  /** With this, a value naming an image shows the image in the detail of an individual (#228). */
  images?: DataImages;
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
  let search = '';
  let selected: string | null = null;
  /** The groups the user opened or closed; the others are closed, unless a filter is typed. */
  let toggled = new Map<string, boolean>();
  /** How many rows of each group are listed; a page more at a time. */
  let rowLimits = new Map<string, number>();

  // The parts of the tab, set when it is drawn.
  let controls!: HTMLElement;
  let searchInput!: HTMLInputElement;
  let list!: HTMLUListElement;
  let empty!: HTMLElement;
  let rangeText!: HTMLElement;
  let detail!: HTMLElement;
  let drawnLine!: HTMLElement;
  let originLine!: HTMLElement;

  const prefixes = () => withStandardPrefixes(deps.getPrefixes());
  const nameOf = (iri: string): string => formatTerm(DataFactory.namedNode(iri), prefixes()).text;
  /** A class's label in the graph, else its prefixed name, else its local name (no prefix applies, as for data opened with no ontology, #234). */
  const classTitle = (iri: string): string => {
    const label = deps.getClassLabel?.(iri);
    if (label) return label;
    const name = nameOf(iri);
    return name.startsWith('<') ? extractLocalName(iri) || name : name;
  };

  /** A button that selects a class or a property in the graph, when it is there; null otherwise (#216). */
  function schemaButton(iri: string, text: string, title: string): HTMLButtonElement | null {
    const links = deps.schemaLinks;
    const match = links?.match(iri);
    if (!links || !match) return null;
    const button = element('button', 'schema-follow', text);
    button.type = 'button';
    button.title = `${title}: select it in the graph`;
    button.setAttribute('data-individuals-schema-link', '');
    button.addEventListener('click', () => links.show(match));
    return button;
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
      return;
    }
    const groups = index.groups({ search });
    const total = groups.reduce((sum, g) => sum + g.total, 0);
    empty.hidden = total > 0;
    if (total === 0) empty.textContent = 'No individual matches.';
    rangeText.textContent = total === 0 ? '' : `${total.toLocaleString('en')} ${search.trim() ? 'matching ' : ''}in ${groups.length} ${groups.length === 1 ? 'group' : 'groups'}`;
    list.replaceChildren(...groups.flatMap(({ group, total: count }) => [groupHeader(group, count), ...(isOpen(group) ? groupRows(group, count) : [])]));
  }

  /** A group is open when the user opened it, or when a filter is typed (what matches is shown). */
  function isOpen(group: string): boolean {
    return toggled.get(group) ?? search.trim() !== '';
  }

  /** The rows of an open group, up to its limit, and a row to list more. */
  function groupRows(group: string, count: number): HTMLElement[] {
    const limit = rowLimits.get(group) ?? pageSize;
    const { items } = index.listGroup({ search, group, offset: 0, limit });
    const rows = items.map((item) => {
      const button = element('button');
      button.type = 'button';
      button.setAttribute('data-individuals-item', '');
      button.append(element('span', 'individual-label', item.label ?? nameOf(item.iri)), element('span', 'individual-name', nameOf(item.iri)));
      button.title = item.iri;
      button.addEventListener('click', () => select(item.iri));
      const li = element('li');
      if (deps.layer) {
        const preview = deps.layer.preview(item.iri);
        // Marks the individuals that are drawn, however they came to be (their type's button, another individual's, by themselves).
        li.classList.toggle('individual-drawn', preview.shown);
        li.append(button, graphButton(deps.layer, item.iri, preview));
      } else {
        li.append(button);
      }
      return li;
    });
    if (count > items.length) {
      const more = element('button', undefined, `Show ${Math.min(pageSize, count - items.length)} more rows (${items.length} of ${count})`);
      more.type = 'button';
      more.setAttribute('data-individuals-more-rows', '');
      more.addEventListener('click', () => {
        rowLimits.set(group, limit + pageSize);
        renderList();
      });
      const li = element('li', 'individuals-more-rows');
      li.append(more);
      rows.push(li);
    }
    return rows;
  }

  /** The row above the individuals of a type: its name and how many there are, to open or close it, and a button to draw them in batches. */
  function groupHeader(group: string, count: number): HTMLElement {
    const li = element('li', 'individuals-group');
    li.setAttribute('data-individuals-group', group);
    const open = isOpen(group);
    const toggle = element('button', 'individuals-group-toggle');
    toggle.type = 'button';
    toggle.setAttribute('data-individuals-group-toggle', '');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.title = open ? 'Hide the individuals of this type' : 'List the individuals of this type';
    const title = element('span', 'individuals-group-title', `${group === NO_CLASS ? 'No class' : classTitle(group)} (${count})`);
    if (group !== NO_CLASS) title.title = group;
    toggle.append(element('span', 'individuals-group-caret', open ? '▾' : '▸'), title);
    toggle.addEventListener('click', () => {
      toggled.set(group, !open);
      renderList();
    });
    li.append(toggle);
    if (deps.layer && group !== NO_CLASS) li.append(classButton(deps.layer, group));
    return li;
  }

  /** How many of the type's individuals the next click draws, and how many are drawn of all of them. */
  function classButton(layer: IndividualsLayer, classIri: string): HTMLButtonElement {
    const { adds, displayed, total } = layer.previewClass(classIri);
    const button = element('button', 'individual-graph');
    button.type = 'button';
    button.setAttribute('data-individuals-show-class', '');
    if (displayed < total && adds === 0) {
      limitReached(button);
    } else if (displayed < total) {
      button.textContent = `Show ${adds}${displayed > 0 ? ' more' : ''} (${displayed} displayed/${total} total)`;
      button.title = `Draw ${adds}${displayed > 0 ? ' more' : ''} of the individuals of this type in the graph`;
      button.addEventListener('click', () => layer.showClass(classIri));
    } else {
      button.textContent = `All ${total} displayed`;
      button.disabled = true;
    }
    return button;
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
    const schema = term.termType === 'NamedNode' ? schemaButton(term.value, formatted.text, formatted.title) : null;
    if (schema) return schema;
    const span = element('span', `term-${formatted.kind}`, formatted.text);
    span.title = formatted.title;
    return span;
  }

  /** The image a value names, opening whole in a new tab when clicked; or the reason it is not shown. */
  function imagePreview(value: string, found: ImageFound): HTMLElement {
    if (!('url' in found)) {
      const note = element('div', 'individual-image-missing', found.hint);
      note.setAttribute('data-individuals-image-missing', '');
      return note;
    }
    const link = element('a', 'individual-image');
    link.href = found.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.title = `${value}: open the image whole`;
    const img = element('img');
    img.alt = value;
    img.src = found.url;
    img.setAttribute('data-individuals-image', '');
    // An address that does not answer with an image: said in its place.
    img.addEventListener('error', () => link.replaceWith(element('div', 'individual-image-missing', `No image could be read at ${found.url}.`)));
    link.append(img);
    return link;
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
      // A value naming an image (#228): the image under it, or why it cannot be shown.
      const image = side === 'object' && link.object.termType !== 'BlankNode' ? deps.images?.find(link.object.value, selected ?? undefined, link.predicate) : null;
      if (image) row.append(imagePreview(link.object.value, image));
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
    const types = element('p', 'individual-types', described.types.length ? 'Class: ' : 'No class');
    described.types.forEach((type, i) => {
      if (i > 0) types.append(', ');
      types.append(schemaButton(type, classTitle(type), type) ?? classTitle(type));
    });
    const otherLabels = described.labels.slice(1);
    detail.replaceChildren(
      heading,
      iri,
      types,
      ...(otherLabels.length ? [element('p', 'individual-labels', `Also labelled: ${otherLabels.join(', ')}`)] : []),
      ...(deps.layer ? neighboursButton(deps.layer, selected) : []),
      renderLinks('Points to', 'data-individuals-outgoing', described.outgoing, described.outgoingTotal, 'object'),
      renderLinks('Pointed to by', 'data-individuals-incoming', described.incoming, described.incomingTotal, 'subject')
    );
  }

  /** A button that cannot add any more: the graph holds as many individuals as it will draw. */
  function limitReached(button: HTMLButtonElement): void {
    button.textContent = 'Limit reached';
    button.title = 'The graph shows as many individuals as it will draw: use Clear individuals to start again, or filter for a narrower set';
    button.disabled = true;
  }

  /** Next to an individual's row: draws that individual alone, and says whether it is drawn. */
  function graphButton(layer: IndividualsLayer, iri: string, preview: ReturnType<IndividualsLayer['preview']>): HTMLButtonElement {
    const { adds, displayed, total } = preview;
    const button = element('button', 'individual-graph');
    button.type = 'button';
    button.setAttribute('data-individuals-show-in-graph', '');
    if (displayed < total && adds === 0) {
      limitReached(button);
    } else if (displayed < total) {
      button.textContent = `Show ${adds} (${displayed} displayed/${total} total)`;
      button.title = 'Draw this individual in the graph';
      button.addEventListener('click', () => layer.show(iri));
    } else {
      button.textContent = `All ${total} displayed`;
      button.title = 'This individual is drawn';
      button.disabled = true;
    }
    return button;
  }

  /** In the detail of an individual: draws its neighbours, a batch at a time, with how many are drawn of all of them. */
  function neighboursButton(layer: IndividualsLayer, iri: string): HTMLElement[] {
    const { adds, displayed, total } = layer.previewNeighbours(iri);
    if (total === 0) return [];
    const button = element('button', 'individual-graph');
    button.type = 'button';
    button.setAttribute('data-individuals-show-neighbours', '');
    if (displayed < total && adds === 0) {
      limitReached(button);
    } else if (displayed < total) {
      button.textContent = `Show ${adds}${displayed > 0 ? ' more' : ''} ${adds === 1 ? 'neighbour' : 'neighbours'} (${displayed} displayed/${total} total)`;
      button.title = 'Draw this individual and the individuals linked to it, both ways, in the graph';
      button.addEventListener('click', () => layer.showNeighbours(iri));
    } else {
      button.textContent = `All ${total} ${total === 1 ? 'neighbour' : 'neighbours'} displayed`;
      button.disabled = true;
    }
    return [button];
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

  /** Where the individuals come from: the ontology file when it holds some itself (the added data files are listed in their own block). */
  function renderOrigin(): void {
    const source = deps.getOntologySource?.();
    // The ontology's store is the first of the stores; the rest are the data added to it.
    const own = source ? countIndividuals(deps.getStores().slice(0, 1)) : 0;
    originLine.hidden = !source || own === 0;
    if (originLine.hidden || !source) return;
    originLine.textContent = `${own.toLocaleString('en')} ${own === 1 ? 'individual' : 'individuals'} from the ontology file ${source.name}`;
    originLine.title = source.title ?? source.name;
  }

  function select(iri: string): void {
    selected = iri;
    renderDetail();
  }

  /** A new filter starts the groups over: closed, or open where something matches. */
  function resetGroups(): void {
    toggled = new Map();
    rowLimits = new Map();
  }

  const filter = debounced(() => {
    search = searchInput.value;
    resetGroups();
    renderList();
  }, SEARCH_DELAY_MS);

  function render(container: HTMLElement): void {
    container.classList.add('individuals-tab');
    const note = element('p', 'query-note panel-description', 'The individuals of this ontology and of the data added to it. A few are drawn in the graph by themselves; open a type to list its individuals, and use the buttons to draw a type, or one individual and its neighbours.');

    searchInput = element('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Filter individuals by label or name';
    searchInput.setAttribute('aria-label', 'Filter individuals by label or name');
    searchInput.setAttribute('data-individuals-search', '');

    rangeText = element('span', 'individuals-range');
    rangeText.setAttribute('data-individuals-range', '');

    list = element('ul', 'individuals-list');
    list.setAttribute('data-individuals-list', '');
    controls = element('div', 'individuals-controls');
    controls.setAttribute('data-individuals-controls', '');
    controls.append(searchInput, rangeText, list);

    empty = element('p', 'query-note');
    empty.setAttribute('data-individuals-empty', '');
    detail = element('div', 'individuals-detail');
    detail.setAttribute('data-individuals-detail', '');
    detail.hidden = true;
    originLine = element('p', 'query-note');
    originLine.setAttribute('data-individuals-origin', '');
    originLine.hidden = true;
    drawnLine = element('div', 'individuals-drawn');
    drawnLine.setAttribute('data-individuals-drawn', '');
    drawnLine.hidden = true;
    deps.layer?.onChange(() => {
      renderDrawn();
      renderList();
      renderDetail();
    });

    searchInput.addEventListener('input', () => filter.schedule());

    const dataBlock = deps.dataSources && deps.dataLoader ? createDataBlock({
            sources: deps.dataSources,
            loader: deps.dataLoader,
            getLabelStores: deps.getStores,
          }) : null;
    container.append(note, originLine, ...(dataBlock ? [dataBlock] : []), drawnLine, controls, empty, detail);
    drawn = true;
    refresh();
  }

  function refresh(): void {
    if (!drawn) return;
    index = createIndividualIndex(deps.getStores());
    resetGroups();
    renderList();
    if (selected !== null) {
      // The individual chosen is gone when nothing is known of it any more.
      const known = index.describe(selected);
      if (known.types.length === 0 && known.outgoingTotal === 0 && known.incomingTotal === 0) selected = null;
    }
    renderDetail();
    renderDrawn();
    renderOrigin();
  }

  return { id: 'individuals', title: 'Individuals', render, refresh };
}
