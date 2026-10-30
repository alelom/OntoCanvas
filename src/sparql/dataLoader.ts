/**
 * Loading data into the open ontology (#211), apart from any tab: one read at a time, with the progress, Cancel, and what to
 * say when it fails. The Individuals tab shows it beside the controls to add data, and the Query tab shows it when an address
 * (?data=<url>) loaded the files and no other tab was drawn. No DOM.
 */
import type { Store } from 'n3';
import type { AddDataOptions, DataFile, DataSource, DataSources } from './dataSources';

export interface DataLoaderDeps {
  sources: DataSources;
  /** The open ontology's store; null when none is open. */
  getStore: () => Store | null;
  /** Asked about loading a large file; defaults to the browser's confirm. */
  confirm?: (message: string) => Promise<boolean>;
}

export interface DataLoader {
  /** What to tell the user: the progress of a read, the reason one failed, or '' when there is nothing to say. */
  status(): string;
  loading(): boolean;
  addFile(file: DataFile): Promise<void>;
  addUrl(url: string): Promise<void>;
  /** The URLs one after the other; a failure is told at the end, with the others' results kept. */
  addUrls(urls: string[]): Promise<void>;
  /** Stops the read that is going on, if any. */
  cancel(): void;
  /** Another ontology was opened: stops a read and forgets its status and any failure, as nobody asked for that read to stop. */
  reset(): void;
  /** Called when the status or whether it is loading changes. */
  onChange(listener: () => void): void;
}

type Add = (options: AddDataOptions) => Promise<DataSource>;

export function createDataLoader({ sources, getStore, confirm }: DataLoaderDeps): DataLoader {
  const ask = confirm ?? ((message: string) => Promise.resolve(window.confirm(message)));
  const listeners: Array<() => void> = [];
  let status = '';
  let controller: AbortController | null = null;
  /** Counts the resets: a read that began before one has nothing left to say. */
  let generation = 0;

  const set = (next: string): void => {
    status = next;
    listeners.forEach((listener) => listener());
  };

  /** Returns what is left in the status: '' when the data was added or the user said no. */
  async function load(label: string, add: Add): Promise<string> {
    if (controller) return '';
    if (!getStore()) {
      set('Open an ontology first: the data is added to it.');
      return status;
    }
    const mine = new AbortController();
    const began = generation;
    controller = mine;
    set(`Loading ${label}…`);
    // What this read leaves in the status: kept apart from the shared one, which a reset or a later read may have changed.
    let outcome = '';
    try {
      await add({
        signal: mine.signal,
        confirm: ask,
        onProgress: (triples) => {
          if (began === generation) set(`Loading ${label}… ${triples.toLocaleString('en')} triples`);
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // "Cancelled" is the user's Cancel, or a no to the question about a large file (nothing to say then).
      outcome = message === 'Cancelled' ? (mine.signal.aborted ? 'Cancelled.' : '') : message;
    } finally {
      if (controller === mine) controller = null;
    }
    if (began !== generation) {
      // Reset while it ran: its status was cleared then, and the tabs only need to see that it is no longer loading.
      listeners.forEach((listener) => listener());
      return '';
    }
    set(outcome);
    return outcome;
  }

  return {
    status: () => status,
    loading: () => controller !== null,
    addFile: async (file) => void (await load(file.name, (options) => sources.addFile(file, options))),
    addUrl: async (url) => void (await load(url, (options) => sources.addUrl(url, options))),
    async addUrls(urls) {
      const failures: string[] = [];
      for (const url of urls) {
        const left = await load(url, (options) => sources.addUrl(url, options));
        if (left) failures.push(`${url}: ${left}`);
      }
      set(failures.join('  '));
    },
    cancel: () => controller?.abort(),
    reset() {
      generation++;
      const reading = controller;
      controller = null;
      reading?.abort();
      if (status !== '') set('');
    },
    onChange: (listener) => void listeners.push(listener),
  };
}
