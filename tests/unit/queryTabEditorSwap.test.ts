// @vitest-environment jsdom
/**
 * The query tab starts with a plain textarea and swaps in the CodeMirror editor when its chunk arrives (#178).
 * The editor is a stand-in here, so these tests are about the swap, not about CodeMirror.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Store } from 'n3';
import { createQueryTab } from '../../src/ui/sidePanel/queryTab';
import type { QueryResult } from '../../src/sparql/runQuery';
import type { LoadEditor, MountEditor } from '../../src/ui/sidePanel/queryEditor';

let container: HTMLElement;
let prefixes: Record<string, string>;
let run: ReturnType<typeof vi.fn>;

/** A stand-in for CodeMirror: a div, the text it holds, and the hooks it was given. */
function fakeEditor() {
  const state = { text: '', hooks: null as Parameters<MountEditor>[2] | null, focused: false, selection: null as { from: number; to: number } | null | undefined };
  const mountFake: MountEditor = (parent, text, hooks, selection) => {
    state.text = text;
    state.selection = selection;
    state.hooks = hooks;
    const el = document.createElement('div');
    el.className = 'fake-cm';
    parent.append(el);
    return {
      getText: () => state.text,
      setText: (next) => {
        state.text = next;
      },
      focus: () => {
        state.focused = true;
      },
      getSelection: () => state.selection ?? { from: 0, to: 0 },
    };
  };
  return { state, mountFake, load: (() => Promise.resolve(mountFake)) as LoadEditor };
}

const mount = (loadEditor: LoadEditor) => {
  const tab = createQueryTab({ getStore: () => new Store(), getPrefixes: () => prefixes, run: (...a) => run(...a), loadEditor });
  tab.render(container);
  return tab;
};
const host = () => container.querySelector<HTMLElement>('[data-query-editor]')!;
const textarea = () => container.querySelector<HTMLTextAreaElement>('[data-query-editor] textarea')!;

beforeEach(() => {
  document.body.replaceChildren();
  container = document.createElement('div');
  document.body.append(container);
  prefixes = { '': 'http://example.org/o#' };
  run = vi.fn();
});

describe('query tab editor swap', () => {
  it('replaces the textarea with the loaded editor, keeping what was typed meanwhile', async () => {
    let release!: (m: MountEditor) => void;
    const fake = fakeEditor();
    mount(() => new Promise<MountEditor>((resolve) => { release = resolve; }));
    textarea().value = 'ASK { ?s ?p ?o }';

    release(fake.mountFake);
    await vi.waitFor(() => expect(host().getAttribute('data-editor')).toBe('codemirror'));

    expect(host().querySelector('textarea')).toBeNull();
    expect(host().querySelector('.fake-cm')).not.toBeNull();
    expect(fake.state.text).toBe('ASK { ?s ?p ?o }');
  });

  it('runs the loaded editor\'s text when it asks to run', async () => {
    const fake = fakeEditor();
    run.mockResolvedValue({ kind: 'boolean', value: true } satisfies QueryResult);
    mount(fake.load);
    await vi.waitFor(() => expect(fake.state.hooks).not.toBeNull());
    fake.state.text = 'ASK { :a :b :c }';

    fake.state.hooks!.onRun();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][1]).toBe('ASK { :a :b :c }');
  });

  it('counts a change by the user as an edit, so opening another ontology no longer rewrites the query', async () => {
    const fake = fakeEditor();
    const tab = mount(fake.load);
    await vi.waitFor(() => expect(fake.state.hooks).not.toBeNull());

    prefixes = { x: 'http://x/#' };
    tab.refresh();
    expect(fake.state.text).toContain('PREFIX x: <http://x/#>');

    fake.state.hooks!.onChange();
    prefixes = { y: 'http://y/#' };
    tab.refresh();
    expect(fake.state.text).not.toContain('PREFIX y:');
  });

  it('keeps the textarea when the editor cannot be loaded', async () => {
    mount(() => Promise.reject(new Error('offline')));
    await vi.waitFor(() => expect(host().getAttribute('data-editor')).toBe('textarea'));
    expect(textarea()).not.toBeNull();
  });
});
