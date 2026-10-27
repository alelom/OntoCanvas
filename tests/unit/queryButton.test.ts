// @vitest-environment jsdom
/**
 * The SPARQL button sits in the graph's own toolbar, right after "Add Edge" (#171). vis-network builds that toolbar
 * and empties it whenever its mode changes, so the button is put back each time.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mountQueryButton } from '../../src/ui/sidePanel/queryButton';

let wrapper: HTMLElement;
const flush = () => new Promise((r) => setTimeout(r, 0));

/** What vis-network renders: Add Node, a separator, Add Edge (and, with a selection, more buttons after those). */
function renderToolbar(extra = ''): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'vis-manipulation';
  bar.innerHTML = `<button class="vis-button vis-add"><div class="vis-label">Add Node</div></button><div class="vis-separator-line"></div><button class="vis-button vis-connect"><div class="vis-label">Add Edge</div></button>${extra}`;
  wrapper.appendChild(bar);
  return bar;
}
const order = (bar: Element) => [...bar.querySelectorAll('button')].map((b) => b.id || b.className.replace('vis-button ', ''));

beforeEach(() => {
  document.body.innerHTML = '<div id="networkWrapper"></div>';
  wrapper = document.getElementById('networkWrapper')!;
});

describe('mountQueryButton', () => {
  it('puts the button right after Add Edge when the toolbar is there already', () => {
    const bar = renderToolbar('<button class="vis-button vis-edit"></button>');
    mountQueryButton(wrapper, () => {});
    expect(order(bar)).toEqual(['vis-add', 'vis-connect', 'queryPanelBtn', 'vis-edit']);
  });

  it('adds it when vis-network builds the toolbar later, and again after vis-network empties it', async () => {
    mountQueryButton(wrapper, () => {});
    const bar = renderToolbar();
    await flush();
    expect(order(bar)).toEqual(['vis-add', 'vis-connect', 'queryPanelBtn']);

    bar.innerHTML = '<button class="vis-button vis-back"></button>';
    await flush();
    expect(bar.querySelector('#queryPanelBtn')).toBeNull();

    bar.innerHTML = `<button class="vis-button vis-add"></button><button class="vis-button vis-connect"></button>`;
    await flush();
    expect(order(bar)).toEqual(['vis-add', 'vis-connect', 'queryPanelBtn']);
  });

  it('keeps one button when the whole toolbar is replaced', async () => {
    mountQueryButton(wrapper, () => {});
    renderToolbar();
    await flush();
    wrapper.innerHTML = '';
    renderToolbar();
    await flush();
    expect(document.querySelectorAll('#queryPanelBtn').length).toBe(1);
  });

  it('calls back on a click and shows whether the panel is open', async () => {
    let clicks = 0;
    const mount = mountQueryButton(wrapper, () => clicks++);
    renderToolbar();
    await flush();
    document.getElementById('queryPanelBtn')!.click();
    expect(clicks).toBe(1);

    mount.setPressed(true);
    expect(document.getElementById('queryPanelBtn')!.getAttribute('aria-pressed')).toBe('true');
    // a rebuilt toolbar keeps the state
    wrapper.innerHTML = '';
    renderToolbar();
    await flush();
    expect(document.getElementById('queryPanelBtn')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('stops watching when told to', async () => {
    const mount = mountQueryButton(wrapper, () => {});
    mount.destroy();
    renderToolbar();
    await flush();
    expect(document.getElementById('queryPanelBtn')).toBeNull();
  });
});
