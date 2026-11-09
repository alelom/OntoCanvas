// @vitest-environment jsdom
/**
 * Emptying the search box after a pick (#217, #214): the pick draws, and that draw redraws the graph, so emptying the box
 * must not redraw it a second time without keeping the view (#242 review). It says so with its own event, for the
 * search bar's highlight.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearSearchBox, SEARCH_CLEARED } from '../../src/ui/searchBox';

let input: HTMLInputElement;
beforeEach(() => {
  document.body.innerHTML = '<input id="searchQuery" value="room 01">';
  input = document.getElementById('searchQuery') as HTMLInputElement;
});

describe('clearSearchBox', () => {
  it('empties the box and says it was emptied, without an input event', () => {
    const onInput = vi.fn();
    const onCleared = vi.fn();
    input.addEventListener('input', onInput);
    input.addEventListener(SEARCH_CLEARED, onCleared);

    clearSearchBox();

    expect(input.value).toBe('');
    expect(onCleared).toHaveBeenCalledTimes(1);
    expect(onInput).not.toHaveBeenCalled();
  });

  it('does nothing when the box is empty already', () => {
    input.value = '';
    const onCleared = vi.fn();
    input.addEventListener(SEARCH_CLEARED, onCleared);

    clearSearchBox();

    expect(onCleared).not.toHaveBeenCalled();
  });
});
