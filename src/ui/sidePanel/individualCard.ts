/**
 * The record card of an individual (#229), in the Individuals tab: everything known of it on one panel, to read data as records
 * rather than as a graph. Its label (or prefixed name), IRI and classes; its properties, the values of a repeated one together,
 * images under the values that name them (#228); what refers to it, collapsed, with counts; the named graph of each statement
 * when there are several (#224); back and forward between cards; "Draw in graph" (#209) and "Copy IRI". Nothing is written.
 */

import { DataFactory } from 'n3';
import type { DescribedLink, DescribedTerm, IndividualDetail } from '../../abox/individualIndex';
import { limitTitle, type DrawPreview, type IndividualsLayer } from '../../abox/individualsLayer';
import type { DataImages, ImageFound } from '../../abox/dataImages';
import { graphsOf, groupByPredicate } from '../../abox/recordCard';
import { formatTerm } from '../../sparql/formatTerm';
import type { GraphMatch } from '../../sparql/graphMatches';
import { renderImageProblem } from './imageProblem';
import { isOpenableUrl } from '../../utils/openableUrls';
import { copyTextToClipboard } from '../../utils/clipboard';

export interface IndividualCardDeps {
  prefixes: () => Record<string, string>;
  /** An IRI as a prefixed name. */
  nameOf: (iri: string) => string;
  /** A class's label in the graph, else its name. */
  classTitle: (iri: string) => string;
  /** Shows the card of another individual (a link followed). */
  follow: (iri: string) => void;
  /** Back and forward between the cards visited; null when there is nowhere to go. */
  back: (() => void) | null;
  forward: (() => void) | null;
  layer?: IndividualsLayer;
  schemaLinks?: { match: (iri: string) => GraphMatch | null; show: (match: GraphMatch) => void };
  images?: DataImages;
}

const COPIED_MS = 1500;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function button(className: string, attribute: string, text: string, title?: string): HTMLButtonElement {
  const b = element('button', className, text);
  b.type = 'button';
  b.setAttribute(attribute, '');
  if (title) b.title = title;
  return b;
}

const toStoreTerm = (term: DescribedTerm) =>
  term.termType === 'NamedNode'
    ? DataFactory.namedNode(term.value)
    : term.termType === 'BlankNode'
      ? DataFactory.blankNode(term.value)
      : DataFactory.literal(term.value, term.language || (term.datatype ? DataFactory.namedNode(term.datatype) : undefined));

/** What a button says when the graph holds as many individuals as it draws: the limit, by its number. */
export function limitReached(b: HTMLButtonElement, limit: number): void {
  b.textContent = 'Limit reached';
  b.title = limitTitle(limit);
  b.disabled = true;
}

/** Whether a request can add nothing more because of the limit, though some of what it asks for is not drawn. */
export const atLimit = ({ adds, displayed, total }: DrawPreview): boolean => displayed < total && adds === 0;

/** The children of the card of `detail`. */
export function renderIndividualCard(detail: IndividualDetail, deps: IndividualCardDeps): HTMLElement[] {
  const iri = detail.iri;

  /** A button that selects a class or a property in the graph, when it is there; null otherwise (#216). */
  function schemaButton(target: string, text: string, title: string): HTMLButtonElement | null {
    const links = deps.schemaLinks;
    const match = links?.match(target);
    if (!links || !match) return null;
    const b = button('schema-follow', 'data-individuals-schema-link', text, `${title}: select it in the graph`);
    b.addEventListener('click', () => links.show(match));
    return b;
  }

  function renderTerm(term: DescribedTerm, isIndividual: boolean): HTMLElement {
    const formatted = formatTerm(toStoreTerm(term), deps.prefixes());
    if (term.termType === 'NamedNode' && isIndividual) {
      const follow = button('individual-follow', 'data-individuals-follow', formatted.text, `${term.value}: show this individual`);
      follow.addEventListener('click', () => deps.follow(term.value));
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
    if (!('url' in found)) return renderImageProblem(found);
    const link = element('a', 'individual-image');
    // An SVG from a folder is shown, not opened as a page: its scripts would run as the app (#240 review).
    if (isOpenableUrl(found.url)) {
      link.href = found.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.title = `${value}: open the image whole`;
    } else link.title = value;
    const img = element('img');
    img.alt = value;
    img.src = found.url;
    img.setAttribute('data-individuals-image', '');
    // An image that does not load: why, in its place (a path too long, a file that cannot be read, one that is no image).
    img.addEventListener('error', () => {
      const why = deps.images?.diagnose(found.url) ?? Promise.resolve({ hint: `No image could be read at ${found.url}.` });
      void why.then((problem) => link.replaceWith(renderImageProblem(problem)));
    });
    link.append(img);
    return link;
  }

  // The graph of each statement is said only when they come from more than one.
  const showGraphs = graphsOf([...detail.outgoing, ...detail.incoming]).length > 1;
  function graphTag(graph: string): HTMLElement[] {
    if (!showGraphs) return [];
    const tag = element('span', 'individual-graph-tag', graph ? deps.nameOf(graph) : 'default graph');
    tag.title = graph ? `In the graph ${graph}` : 'In the default graph';
    tag.setAttribute('data-individuals-graph', '');
    return [tag];
  }

  /** A row for each property: its name, and its values (or, for what refers to it, the individuals that do). */
  function propertyRows(links: DescribedLink[], side: 'object' | 'subject'): HTMLElement[] {
    return groupByPredicate(links).map(({ predicate, links: values }) => {
      const row = element('li', 'individual-property');
      row.setAttribute('data-individuals-property', '');
      const name = element('span', 'individual-predicate', side === 'subject' ? `${deps.nameOf(predicate)} (${values.length})` : deps.nameOf(predicate));
      name.title = predicate;
      const list = element('ul', 'individual-values');
      for (const link of values) {
        const item = element('li');
        item.setAttribute('data-individuals-value', '');
        item.append(side === 'object' ? renderTerm(link.object, link.objectIsIndividual) : renderTerm({ termType: link.subjectType, value: link.subject }, link.subjectIsIndividual), ...graphTag(link.graph));
        // A value naming an image (#228): the image under it, or why it cannot be shown.
        const image = side === 'object' && link.object.termType !== 'BlankNode' ? deps.images?.find(link.object.value, iri, link.predicate) : null;
        if (image) item.append(imagePreview(link.object.value, image));
        list.append(item);
      }
      row.append(name, list);
      return row;
    });
  }

  const more = (total: number, shown: number): HTMLElement[] => (total > shown ? [element('li', 'individual-more', `…and ${total - shown} more`)] : []);

  function properties(): HTMLElement {
    const section = element('div', 'individual-links');
    section.setAttribute('data-individuals-outgoing', '');
    const rows = element('ul', 'individual-properties');
    rows.append(...propertyRows(detail.outgoing, 'object'), ...more(detail.outgoingTotal, detail.outgoing.length));
    section.append(element('h5', undefined, `Properties (${detail.outgoingTotal})`), rows);
    return section;
  }

  /** What refers to it, collapsed: in generated data the interesting links often point to an individual, and there can be many. */
  function referencedBy(): HTMLElement {
    const section = element('details', 'individual-links');
    section.setAttribute('data-individuals-incoming', '');
    const rows = element('ul', 'individual-properties');
    rows.append(...propertyRows(detail.incoming, 'subject'), ...more(detail.incomingTotal, detail.incoming.length));
    section.append(element('summary', undefined, `Referenced by (${detail.incomingTotal})`), rows);
    return section;
  }

  /** The images of the frames an individual is drawn from (#241), such as a title block's crop: each with the image individual it is kept on. */
  function linkedImages(): HTMLElement[] {
    const linked = deps.images?.linkedImages(iri) ?? [];
    if (!linked.length) return [];
    const section = element('div', 'individual-links');
    section.setAttribute('data-individuals-linked-images', '');
    section.append(element('h5', undefined, `Images of it (${linked.length})`));
    const rows = element('ul');
    for (const { image, value, found } of linked) {
      const row = element('li');
      row.append(renderTerm({ termType: 'NamedNode', value: image }, true), imagePreview(value, found));
      rows.append(row);
    }
    section.append(rows);
    return [section];
  }

  function navigation(): HTMLElement {
    const nav = element('div', 'individual-card-nav');
    const back = button('individual-nav', 'data-individuals-back', '◀ Back', 'The card shown before');
    const forward = button('individual-nav', 'data-individuals-forward', 'Forward ▶', 'The card shown after');
    back.disabled = !deps.back;
    forward.disabled = !deps.forward;
    if (deps.back) back.addEventListener('click', deps.back);
    if (deps.forward) forward.addEventListener('click', deps.forward);
    nav.append(back, forward);
    return nav;
  }

  function copyIri(): HTMLButtonElement {
    const copy = button('individual-copy', 'data-individuals-copy-iri', 'Copy IRI', 'Copy the IRI of this individual');
    copy.addEventListener('click', () => {
      // The app's copy: it falls back where the Clipboard API is missing or refused (#242 review).
      void copyTextToClipboard(iri).then((copied) => {
        copy.textContent = copied ? 'Copied' : 'Copy failed';
        setTimeout(() => (copy.textContent = 'Copy IRI'), COPIED_MS);
      });
    });
    return copy;
  }

  /** Draws it in the graph, selected and brought into view; once drawn, brings it into view again. */
  function drawButton(layer: IndividualsLayer): HTMLButtonElement {
    const preview = layer.preview(iri);
    const draw = button('individual-graph', 'data-individuals-draw', preview.shown ? 'Show in graph' : 'Draw in graph');
    if (atLimit(preview)) {
      limitReached(draw, layer.limit);
      return draw;
    }
    draw.title = preview.shown ? 'Select this individual in the graph and bring it into view' : 'Draw this individual in the graph, selected';
    draw.addEventListener('click', () => layer.show(iri, { focus: true }));
    return draw;
  }

  /** Draws its neighbours, a batch at a time, with how many are drawn of all of them. */
  function neighboursButton(layer: IndividualsLayer): HTMLElement[] {
    const preview = layer.previewNeighbours(iri);
    const { adds, displayed, total } = preview;
    if (total === 0) return [];
    const b = button('individual-graph', 'data-individuals-show-neighbours', '');
    if (atLimit(preview)) {
      limitReached(b, layer.limit);
    } else if (displayed < total) {
      b.textContent = `Show ${adds}${displayed > 0 ? ' more' : ''} ${adds === 1 ? 'neighbour' : 'neighbours'} (${displayed} displayed/${total} total)`;
      b.title = 'Draw this individual and the individuals linked to it, both ways, in the graph';
      b.addEventListener('click', () => layer.showNeighbours(iri));
    } else {
      b.textContent = `All ${total} ${total === 1 ? 'neighbour' : 'neighbours'} displayed`;
      b.disabled = true;
    }
    return [b];
  }

  const heading = element('h4', undefined, detail.labels[0] ?? deps.nameOf(iri));
  const iriLine = element('p', 'individual-iri', iri);
  iriLine.setAttribute('data-individuals-iri', '');
  const types = element('p', 'individual-types', detail.types.length ? 'Class: ' : 'No class');
  detail.types.forEach((type, i) => {
    if (i > 0) types.append(', ');
    types.append(schemaButton(type, deps.classTitle(type), type) ?? deps.classTitle(type));
  });
  const otherLabels = detail.labels.slice(1);
  const actions = element('div', 'individual-actions');
  actions.append(...(deps.layer ? [drawButton(deps.layer), ...neighboursButton(deps.layer)] : []), copyIri());
  return [
    navigation(),
    heading,
    iriLine,
    types,
    ...(otherLabels.length ? [element('p', 'individual-labels', `Also labelled: ${otherLabels.join(', ')}`)] : []),
    actions,
    ...linkedImages(),
    properties(),
    referencedBy(),
  ];
}
