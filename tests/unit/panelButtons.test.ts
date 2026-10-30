// @vitest-environment jsdom
/**
 * The buttons that open the side panel sit in the graph's own toolbar, right after "Add Edge" (#171, #211): SPARQL query, then
 * Individuals. vis-network builds that toolbar and empties it whenever its mode changes, so the buttons are put back each time.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mountPanelButtons, type PanelButtonSpec } from '../../src/ui/sidePanel/panelButtons';

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

const spec = (id: string, label: string, onClick: () => void = () => {}): PanelButtonSpec => ({ id, label, title: `${label} title`, onClick });
const QUERY = 'queryPanelBtn';
const INDIVIDUALS = 'individualsPanelBtn';

beforeEach(() => {
  document.body.innerHTML = '<div id="networkWrapper"></div>';
  wrapper = document.getElementById('networkWrapper')!;
});

describe('mountPanelButtons', () => {
  it('puts the buttons after Add Edge, in order, when the toolbar is there already', () => {
    const bar = renderToolbar();
    mountPanelButtons(wrapper, [spec(QUERY, 'SPARQL query'), spec(INDIVIDUALS, 'Individuals')]);
    expect(order(bar)).toEqual(['vis-add', 'vis-connect', QUERY, INDIVIDUALS]);
  });

  it('puts them after the Edit button too, which vis-network adds for a selection, not between it and Add Edge (#209)', async () => {
    const bar = renderToolbar('<div class="vis-separator-line"></div><button class="vis-button vis-edit"></button>');
    mountPanelButtons(wrapper, [spec(QUERY, 'SPARQL query'), spec(INDIVIDUALS, 'Individuals')]);
    expect(order(bar)).toEqual(['vis-add', 'vis-connect', 'vis-edit', QUERY, INDIVIDUALS]);
  });

  it('takes the Edit button and the separator before it away while the selection is of individuals, which cannot be edited (#209)', async () => {
    let individualsSelected = true;
    const bar = renderToolbar('<div class="vis-separator-line"></div><button class="vis-button vis-edit"></button>');
    mountPanelButtons(wrapper, [spec(QUERY, 'SPARQL query')], { hideEdit: () => individualsSelected });
    await flush();
    expect(bar.querySelector('.vis-edit')).toBeNull();
    expect(bar.querySelectorAll('.vis-separator-line')).toHaveLength(2);
    expect(order(bar)).toEqual(['vis-add', 'vis-connect', QUERY]);

    // vis-network rebuilds the toolbar when the selection changes: now of a class, so the button stays.
    individualsSelected = false;
    bar.innerHTML = '<button class="vis-button vis-add"></button><button class="vis-button vis-connect"></button><div class="vis-separator-line"></div><button class="vis-button vis-edit"></button>';
    await flush();
    expect(order(bar)).toEqual(['vis-add', 'vis-connect', 'vis-edit', QUERY]);
  });

  it('puts one separator before the buttons, not one for each', () => {
    const bar = renderToolbar();
    mountPanelButtons(wrapper, [spec(QUERY, 'SPARQL query'), spec(INDIVIDUALS, 'Individuals')]);
    expect(bar.querySelectorAll('.vis-separator-line')).toHaveLength(2);
    expect(bar.querySelector(`.vis-connect + .vis-separator-line + #${QUERY} + #${INDIVIDUALS}`)).not.toBeNull();
  });

  it('adds them when vis-network builds the toolbar later, and again after vis-network empties it', async () => {
    mountPanelButtons(wrapper, [spec(QUERY, 'SPARQL query'), spec(INDIVIDUALS, 'Individuals')]);
    const bar = renderToolbar();
    await flush();
    expect(order(bar)).toEqual(['vis-add', 'vis-connect', QUERY, INDIVIDUALS]);

    bar.innerHTML = '<button class="vis-button vis-back"></button>';
    await flush();
    expect(bar.querySelector(`#${QUERY}`)).toBeNull();
    expect(bar.querySelector(`#${INDIVIDUALS}`)).toBeNull();

    bar.innerHTML = `<button class="vis-button vis-add"></button><button class="vis-button vis-connect"></button>`;
    await flush();
    expect(order(bar)).toEqual(['vis-add', 'vis-connect', QUERY, INDIVIDUALS]);
  });

  it('keeps one of each when the whole toolbar is replaced', async () => {
    mountPanelButtons(wrapper, [spec(QUERY, 'SPARQL query'), spec(INDIVIDUALS, 'Individuals')]);
    renderToolbar();
    await flush();
    wrapper.innerHTML = '';
    renderToolbar();
    await flush();
    expect(document.querySelectorAll(`#${QUERY}`).length).toBe(1);
    expect(document.querySelectorAll(`#${INDIVIDUALS}`).length).toBe(1);
  });

  it('calls back with the click of each button, and shows which of them is pressed, across a rebuilt toolbar', async () => {
    const clicks: string[] = [];
    const mount = mountPanelButtons(wrapper, [spec(QUERY, 'SPARQL query', () => clicks.push('query')), spec(INDIVIDUALS, 'Individuals', () => clicks.push('individuals'))]);
    renderToolbar();
    await flush();
    document.getElementById(INDIVIDUALS)!.click();
    document.getElementById(QUERY)!.click();
    expect(clicks).toEqual(['individuals', 'query']);

    mount.setPressed(INDIVIDUALS, true);
    expect(document.getElementById(INDIVIDUALS)!.getAttribute('aria-pressed')).toBe('true');
    expect(document.getElementById(QUERY)!.getAttribute('aria-pressed')).toBe('false');
    wrapper.innerHTML = '';
    renderToolbar();
    await flush();
    expect(document.getElementById(INDIVIDUALS)!.getAttribute('aria-pressed')).toBe('true');
  });

  it('changes the label and the tooltip of a button, and keeps them across a rebuilt toolbar', async () => {
    const mount = mountPanelButtons(wrapper, [spec(QUERY, 'SPARQL query'), spec(INDIVIDUALS, 'Add individuals')]);
    renderToolbar();
    await flush();
    expect(document.getElementById(INDIVIDUALS)!.textContent).toBe('Add individuals');

    mount.setLabel(INDIVIDUALS, 'Individuals (2,134)');
    mount.setTitle(INDIVIDUALS, 'Browse the 2,134 individuals');
    expect(document.getElementById(INDIVIDUALS)!.textContent).toBe('Individuals (2,134)');
    expect(document.getElementById(INDIVIDUALS)!.title).toBe('Browse the 2,134 individuals');
    expect(document.getElementById(QUERY)!.textContent).toBe('SPARQL query');

    wrapper.innerHTML = '';
    renderToolbar();
    await flush();
    expect(document.getElementById(INDIVIDUALS)!.textContent).toBe('Individuals (2,134)');
    expect(document.getElementById(INDIVIDUALS)!.title).toBe('Browse the 2,134 individuals');
  });

  it('writes a label as text, not as markup', async () => {
    const mount = mountPanelButtons(wrapper, [spec(INDIVIDUALS, 'x')]);
    renderToolbar();
    await flush();

    mount.setLabel(INDIVIDUALS, '<img src=x onerror=alert(1)>');

    expect(document.getElementById(INDIVIDUALS)!.querySelector('img')).toBeNull();
    expect(document.getElementById(INDIVIDUALS)!.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('stops watching when told to', async () => {
    const mount = mountPanelButtons(wrapper, [spec(QUERY, 'SPARQL query')]);
    mount.destroy();
    renderToolbar();
    await flush();
    expect(document.getElementById(QUERY)).toBeNull();
  });
});
