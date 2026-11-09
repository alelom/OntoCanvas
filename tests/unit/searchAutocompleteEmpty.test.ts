// @vitest-environment jsdom
/** The search's suggestions are hidden when nothing matches, not shown as an empty box (#242 review). */
import { describe, it, expect, beforeEach } from 'vitest';
import { updateSearchAutocomplete } from '../../src/ui/searchAutocomplete';
import { setIndividualSearchProvider } from '../../src/ui/individualSuggestions';

beforeEach(() => {
  document.body.innerHTML = '<input id="searchQuery"><div id="searchAutocomplete"></div>';
  setIndividualSearchProvider(null);
});

describe('the search suggestions', () => {
  it('are hidden when nothing matches', () => {
    (document.getElementById('searchQuery') as HTMLInputElement).value = 'nothing like it';

    updateSearchAutocomplete();

    const list = document.getElementById('searchAutocomplete')!;
    expect(list.children).toHaveLength(0);
    expect(list.classList.contains('visible')).toBe(false);
  });
});
