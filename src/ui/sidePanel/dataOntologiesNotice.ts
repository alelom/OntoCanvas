/**
 * The offer to open the ontologies the data was made with (#236), in the Individuals tab. It asks, and never opens anything
 * on its own: opening fetches from the network. It says what it opened and what could not be read. A declined offer is not
 * made again until the data names something else.
 */
import { ontologyName, type DataOntology } from '../../abox/dataOntologies';

export interface DataOntologiesDeps {
  /** The ontologies the data names that are not loaded yet. */
  find(): DataOntology[];
  open(iris: string[]): Promise<{ opened: string[]; failed: string[] }>;
}

/** "a", "a and b", "a, b and c". */
const inWords = (names: string[]): string => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function createDataOntologiesNotice(deps: DataOntologiesDeps): { element: HTMLElement; render(): void } {
  const notice = element('div', 'query-data-parts');
  notice.hidden = true;
  notice.setAttribute('data-data-ontologies', '');
  const text = element('span');
  const open = element('button', undefined, 'Open them');
  open.type = 'button';
  open.setAttribute('data-data-ontologies-open', '');
  const dismiss = element('button', undefined, 'Not now');
  dismiss.type = 'button';
  dismiss.setAttribute('data-data-ontologies-dismiss', '');
  notice.append(text, open, dismiss);

  /** What was declined, or opened: not offered again while the data names the same. */
  let settled: string | null = null;
  /** What the last opening said, shown until the offer changes. */
  let outcome: string | null = null;
  let busy = false;
  let offered: DataOntology[] = [];

  const render = (): void => {
    if (busy) return;
    offered = deps.find();
    const key = offered.map((o) => o.iri).join(' ');
    const offering = offered.length > 0 && key !== settled;
    if (!offering) {
      notice.hidden = outcome === null;
      text.textContent = outcome ?? '';
      open.hidden = true;
      dismiss.textContent = 'Dismiss';
      return;
    }
    outcome = null;
    notice.hidden = false;
    open.hidden = false;
    open.disabled = false;
    dismiss.textContent = 'Not now';
    const names = offered.map((o) => ontologyName(o.iri));
    const list = element('span', undefined, inWords(names));
    list.title = offered.map((o) => `${o.iri} (${o.via})`).join('\n');
    text.replaceChildren(
      `This data names ${offered.length === 1 ? '1 ontology' : `${offered.length} ontologies`} it was made with: `,
      list,
      '. Open them? They are read as context, never saved.'
    );
  };

  open.addEventListener('click', async () => {
    const iris = offered.map((o) => o.iri);
    busy = true;
    open.disabled = true;
    text.textContent = `Reading ${iris.length === 1 ? '1 ontology' : `${iris.length} ontologies`}…`;
    try {
      const { opened, failed } = await deps.open(iris);
      const parts: string[] = [];
      if (opened.length) parts.push(`Opened ${inWords(opened.map(ontologyName))}: their classes name the individuals.`);
      if (failed.length) parts.push(`Could not read ${inWords(failed.map(ontologyName))}: the address may not answer with RDF, or may not let this page read it.`);
      outcome = parts.join(' ');
    } finally {
      busy = false;
      // What is left to offer is what could not be read: not offered again, the outcome says why.
      settled = deps.find().map((o) => o.iri).join(' ');
      render();
    }
  });
  dismiss.addEventListener('click', () => {
    settled = offered.map((o) => o.iri).join(' ');
    outcome = null;
    notice.hidden = true;
  });

  return { element: notice, render };
}
