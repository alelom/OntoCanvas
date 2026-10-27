// @vitest-environment jsdom
/**
 * Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo and redo the ontology, except where the user is typing: there the browser's
 * own undo (or the editor's) must work, and the ontology must not change behind the panel (#180).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const performUndo = vi.fn();
const performRedo = vi.fn();
vi.mock('../../src/workflows/undoRedo', () => ({ performUndo: () => performUndo(), performRedo: () => performRedo() }));

import { handleHistoryShortcut } from '../../src/ui/historyShortcuts';
import { isTextEditingElement } from '../../src/utils/textEditing';

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...init });
  (document.activeElement ?? document.body).dispatchEvent(event);
  handleHistoryShortcut(event);
  return event;
}

beforeEach(() => {
  document.body.replaceChildren();
  performUndo.mockClear();
  performRedo.mockClear();
});

describe('isTextEditingElement', () => {
  it('is true for inputs, textareas and contenteditable elements, false otherwise', () => {
    const make = (html: string) => {
      document.body.innerHTML = html;
      return document.body.firstElementChild as HTMLElement;
    };
    expect(isTextEditingElement(make('<input>'))).toBe(true);
    expect(isTextEditingElement(make('<textarea></textarea>'))).toBe(true);
    expect(isTextEditingElement(make('<div contenteditable="true"></div>'))).toBe(true);
    expect(isTextEditingElement(make('<div contenteditable=""></div>'))).toBe(true);
    expect(isTextEditingElement(make('<div contenteditable="false"></div>'))).toBe(false);
    expect(isTextEditingElement(make('<div></div>'))).toBe(false);
    expect(isTextEditingElement(null)).toBe(false);
  });
});

describe('handleHistoryShortcut', () => {
  it('undoes the ontology on Ctrl+Z when nothing is being typed in', () => {
    const event = press('z');
    expect(performUndo).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('redoes on Ctrl+Shift+Z and on Ctrl+Y', () => {
    press('z', { shiftKey: true });
    press('y');
    expect(performRedo).toHaveBeenCalledTimes(2);
    expect(performUndo).not.toHaveBeenCalled();
  });

  it('also answers Cmd', () => {
    press('z', { ctrlKey: false, metaKey: true });
    expect(performUndo).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a textarea', '<textarea id="f"></textarea>'],
    ['an input', '<input id="f">'],
    ['a contenteditable (the CodeMirror content)', '<div id="f" contenteditable="true" tabindex="0"></div>'],
  ])('leaves undo and redo to the browser while the focus is in %s', (_name, html) => {
    document.body.innerHTML = html;
    document.getElementById('f')!.focus();

    const undo = press('z');
    const redo = press('y');

    expect(performUndo).not.toHaveBeenCalled();
    expect(performRedo).not.toHaveBeenCalled();
    expect(undo.defaultPrevented).toBe(false);
    expect(redo.defaultPrevented).toBe(false);
  });

  it('ignores other keys', () => {
    press('x');
    expect(performUndo).not.toHaveBeenCalled();
  });
});
