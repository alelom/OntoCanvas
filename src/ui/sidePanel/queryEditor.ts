/**
 * The text field of the query tab. It starts as a plain textarea, so the panel is usable at once and stays usable if
 * the editor cannot be loaded (offline, a blocked chunk); the CodeMirror editor (./codeMirrorEditor, a chunk of its own,
 * fetched when the panel is first opened) then replaces it, keeping the text. See #178.
 */

export interface QueryEditorHooks {
  /** The user changed the text (not a call to `setText`). */
  onChange(): void;
  /** Ctrl+Enter or Cmd+Enter. */
  onRun(): void;
}

export interface QueryEditor {
  getText(): string;
  /** Replace the text without counting as a change by the user. */
  setText(text: string): void;
  focus(): void;
  /** The selection, as character offsets (a cursor has `from === to`). */
  getSelection(): EditorSelectionRange;
}

export interface EditorSelectionRange {
  from: number;
  to: number;
}

/** Mounts an editor inside `parent`, holding `text`, with `selection` selected (the start of the text when not given). */
export type MountEditor = (parent: HTMLElement, text: string, hooks: QueryEditorHooks, selection?: EditorSelectionRange) => QueryEditor;

/** Fetches the CodeMirror editor. Injected into the tab so that tests do not load it. */
export type LoadEditor = () => Promise<MountEditor>;

export const loadCodeMirrorEditor: LoadEditor = () => import('./codeMirrorEditor').then((m) => m.mountCodeMirror);

export const mountTextarea: MountEditor = (parent, text, hooks, selection) => {
  const textarea = document.createElement('textarea');
  textarea.className = 'query-editor-textarea';
  textarea.spellcheck = false;
  textarea.rows = 12;
  textarea.value = text;
  textarea.setAttribute('aria-label', 'SPARQL query');
  textarea.addEventListener('input', () => hooks.onChange());
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      hooks.onRun();
    }
  });
  parent.append(textarea);
  if (selection) textarea.setSelectionRange(selection.from, selection.to);
  return {
    getText: () => textarea.value,
    setText: (next) => {
      textarea.value = next;
    },
    focus: () => textarea.focus(),
    getSelection: () => ({ from: textarea.selectionStart, to: textarea.selectionEnd }),
  };
};
