/**
 * The CodeMirror 6 editor of the query tab (#178): SPARQL highlighting, bracket matching, undo history, line wrapping.
 * Imported only through `loadCodeMirrorEditor`, so it is a chunk of its own, fetched when the panel opens.
 *
 * Tab is left to the browser (it moves focus out of the editor), so the keyboard is never trapped.
 */
import { EditorState } from '@codemirror/state';
import { EditorView, drawSelection, keymap } from '@codemirror/view';
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { sparql } from 'codemirror-lang-sparql';
import type { MountEditor } from './queryEditor';

const theme = EditorView.theme({
  '&': { border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px', backgroundColor: '#fff' },
  '&.cm-focused': { outline: '2px solid #3498db', outlineOffset: '-1px' },
  '.cm-scroller': { fontFamily: 'Consolas, monospace', minHeight: '12em', maxHeight: '60vh', overflow: 'auto' },
  '.cm-content': { padding: '8px' },
});

export const mountCodeMirror: MountEditor = (parent, text, hooks) => {
  let silent = false;
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        history(),
        drawSelection(),
        bracketMatching(),
        sparql(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': 'SPARQL query', spellcheck: 'false' }),
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              hooks.onRun();
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !silent) hooks.onChange();
        }),
        theme,
      ],
    }),
  });

  return {
    getText: () => view.state.doc.toString(),
    setText(next) {
      silent = true;
      try {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
      } finally {
        silent = false;
      }
    },
    focus: () => view.focus(),
  };
};
