/**
 * Loading data into the open ontology (#211), apart from any tab: one read at a time, with the progress, Cancel, and what to
 * say when it fails. The Individuals tab shows it beside the controls to add data, and the Query tab shows it when an address
 * (?data=<url>) loaded the files and no other tab was drawn. No DOM.
 *
 * Several files are added as one selection (#222): one progress line, one question about their total size, and Cancel stops
 * the rest. The total is judged as for one file, and each file may hold only what is left of the limit after those before it.
 */
import type { Store } from 'n3';
import {
  classifyDataSize,
  compressedDataQuestion,
  DATA_LOAD_LIMIT_BYTES,
  DATA_REFUSE_LIMIT_BYTES,
  megabytes,
  type DataFile,
  type DataSources,
} from './dataSources';
import { estimateDataBytes, isGzipName } from './readDataBytes';

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
  /** The files one after the other, as one selection (#222); a failure is told at the end, with the others' results kept. */
  addFiles(files: DataFile[]): Promise<void>;
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

interface Read {
  signal: AbortSignal;
  /** Shows what is being read, and the triples read so far once there are some. */
  progress(label: string, triples?: number): void;
}

/** What a selection of files holds, and the question or the refusal it calls for before any of it is read. */
export function judgeSelection(files: Array<{ name: string; size: number }>): { tier: 'load' | 'confirm' | 'refuse'; message?: string } {
  const size = files.reduce((sum, f) => sum + f.size, 0);
  const estimate = files.reduce((sum, f) => sum + estimateDataBytes(f), 0);
  const compressed = files.some((f) => isGzipName(f.name));
  const one = files.length === 1;
  const sizeSubject = one ? `This file is ${megabytes(size)}` : `These ${files.length} files are ${megabytes(size)} together`;
  // What is on disk already passes the limit: refused, whatever the data turns out to be.
  if (size > DATA_REFUSE_LIMIT_BYTES) return classifyDataSize(size, sizeSubject);
  if (estimate <= DATA_LOAD_LIMIT_BYTES) return { tier: 'load' };
  if (!compressed) return classifyDataSize(estimate, sizeSubject);
  const estimateSubject = `${one ? 'This compressed file is' : `These ${files.length} files are`} ${megabytes(size)}, some ${megabytes(estimate)} of data once decompressed`;
  return { tier: 'confirm', message: compressedDataQuestion(estimateSubject) };
}

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

  /**
   * Runs one read, one at a time: `work` returns what is left to say ('' when all went well or the user said no) or throws.
   * Returns what is left in the status.
   */
  async function load(label: string, work: (read: Read) => Promise<string>): Promise<string> {
    if (controller) return '';
    if (!getStore()) {
      set('Open an ontology first: the data is added to it.');
      return status;
    }
    const mine = new AbortController();
    const began = generation;
    controller = mine;
    set(label);
    // What this read leaves in the status: kept apart from the shared one, which a reset or a later read may have changed.
    let outcome = '';
    try {
      outcome = await work({
        signal: mine.signal,
        progress: (what, triples) => {
          if (began === generation) set(triples === undefined ? what : `${what} ${triples.toLocaleString('en')} triples`);
        },
      });
    } catch (error) {
      outcome = describeFailure(error, mine.signal);
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

  const loadUrl = (url: string): Promise<string> =>
    load(`Loading ${url}…`, async ({ signal, progress }) => {
      await sources.addUrl(url, { signal, confirm: ask, onProgress: (triples) => progress(`Loading ${url}…`, triples) });
      return '';
    });

  async function addFiles(files: DataFile[]): Promise<void> {
    if (!files.length) return;
    const one = files.length === 1;
    const labelOf = (i: number) => (one ? `Loading ${files[i].name}…` : `Adding ${i + 1} of ${files.length}: ${files[i].name}…`);
    await load(labelOf(0), async ({ signal, progress }) => {
      const { tier, message } = judgeSelection(files);
      if (tier === 'refuse') return message!;
      if (tier === 'confirm' && !(await ask(message!))) return '';
      const failures: string[] = [];
      let left = DATA_REFUSE_LIMIT_BYTES;
      for (let i = 0; i < files.length; i++) {
        if (signal.aborted) return 'Cancelled.';
        const label = labelOf(i);
        progress(label);
        try {
          const added = await sources.addFile(files[i], { signal, limitBytes: left, onProgress: (triples) => progress(label, triples) });
          left -= added.bytes;
        } catch (error) {
          const failure = describeFailure(error, signal);
          if (failure === 'Cancelled.') return failure;
          if (failure) failures.push(one ? failure : `${files[i].name}: ${failure}`);
        }
      }
      return failures.join('  ');
    });
  }

  return {
    status: () => status,
    loading: () => controller !== null,
    addFile: (file) => addFiles([file]),
    addFiles,
    addUrl: async (url) => void (await loadUrl(url)),
    async addUrls(urls) {
      const failures: string[] = [];
      for (const url of urls) {
        const left = await loadUrl(url);
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

/** "Cancelled" is the user's Cancel, or a no to the question about a large file (nothing to say then). */
function describeFailure(error: unknown, signal: AbortSignal): string {
  const message = error instanceof Error ? error.message : String(error);
  return message === 'Cancelled' ? (signal.aborted ? 'Cancelled.' : '') : message;
}
