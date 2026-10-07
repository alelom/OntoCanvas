// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { attachPopover, getSearchScope, searchControlsMarkup, setSearchScope } from './searchOptions';

describe('search controls (#85)', () => {
  beforeEach(() => {
    document.body.innerHTML = searchControlsMarkup();
  });

  it('labels the search bar above it, with the options button below', () => {
    const block = document.getElementById('searchBlock')!;
    const order = [...block.querySelectorAll(':scope > strong, #searchQuery, #searchOptionsToggle')].map((el) => el.id || el.textContent);
    expect(order).toEqual(['Search:', 'searchQuery', 'searchOptionsToggle']);
  });

  it('offers three scopes, each explained by a tooltip, with "matches only" as the default', () => {
    const radios = [...document.querySelectorAll<HTMLInputElement>('input[name="searchScope"]')];
    expect(radios.map((r) => r.value)).toEqual(['highlight', 'neighbours', 'matches']);
    for (const r of radios) expect(r.closest('label')?.title).toBeTruthy();
    expect(getSearchScope()).toBe('matches');
  });

  it('keeps Exact match in its own column next to the scopes, on by default', () => {
    const scopes = document.querySelector('[role="radiogroup"]')!;
    const exact = document.getElementById('searchExactMatch') as HTMLInputElement;
    expect(scopes.contains(exact)).toBe(false);
    expect(scopes.parentElement!.contains(exact)).toBe(true);
    expect(exact.checked).toBe(true);
  });

  it('sets and reads the scope', () => {
    setSearchScope('highlight');
    expect(getSearchScope()).toBe('highlight');
    expect((document.querySelector('input[value="highlight"]') as HTMLInputElement).checked).toBe(true);
  });
});

describe('popover button', () => {
  let toggle: HTMLButtonElement;
  let popup: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '<div id="w"><button id="t"></button><div id="p" style="display:none"><input id="i"></div></div><p id="out"></p>';
    toggle = document.getElementById('t') as HTMLButtonElement;
    popup = document.getElementById('p')!;
    attachPopover(document.getElementById('w')!, toggle, popup);
  });

  it('opens and closes on its button', () => {
    toggle.click();
    expect(popup.style.display).toBe('block');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    expect(popup.style.display).toBe('none');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('stays open when clicking inside, closes when clicking outside', () => {
    toggle.click();
    document.getElementById('i')!.click();
    expect(popup.style.display).toBe('block');
    document.getElementById('out')!.click();
    expect(popup.style.display).toBe('none');
  });
});
