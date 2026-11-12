// @vitest-environment jsdom
/**
 * The keys of the search's suggestions (moved out of main.ts, #198): the arrows move the highlight, Enter does what a click on the
 * highlighted suggestion does, Escape closes them, and a click outside the box and the list closes them too.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { attachSearchSuggestionKeys } from '../../src/ui/searchSuggestionKeys';

let list: HTMLElement;
const clicked = vi.fn();
const key = (k: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const highlighted = () => [...list.querySelectorAll('.suggestion')].map((el) => el.classList.contains('highlight'));

let attached = false;
beforeEach(() => {
  document.body.innerHTML = '<input id="searchQuery"><div id="searchAutocomplete" class="visible"></div><p id="elsewhere"></p>';
  list = document.getElementById('searchAutocomplete')!;
  for (const name of ['Room', 'Wall', 'Floor']) {
    const item = document.createElement('div');
    item.className = 'suggestion';
    item.textContent = name;
    item.addEventListener('click', () => clicked(name));
    list.append(item);
  }
  clicked.mockClear();
  // Listeners on the document stay for the file: attach them once.
  if (!attached) attachSearchSuggestionKeys();
  attached = true;
});

describe('the keys of the search suggestions', () => {
  it('moves the highlight down and up', () => {
    key('ArrowDown');
    key('ArrowDown');
    expect(highlighted()).toEqual([false, true, false]);

    key('ArrowUp');
    expect(highlighted()).toEqual([true, false, false]);
  });

  it('clicks the highlighted suggestion with Enter', () => {
    key('ArrowDown');
    key('Enter');

    expect(clicked).toHaveBeenCalledWith('Room');
  });

  it('closes the suggestions with Escape, and on a click elsewhere', () => {
    key('Escape');
    expect(list.classList.contains('visible')).toBe(false);

    list.classList.add('visible');
    document.getElementById('elsewhere')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(list.classList.contains('visible')).toBe(false);
  });

  it('does nothing while the suggestions are closed', () => {
    list.classList.remove('visible');
    key('ArrowDown');

    expect(highlighted()).toEqual([false, false, false]);
  });
});
