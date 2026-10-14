// @vitest-environment jsdom
/**
 * The property menus' groups on the page (#137): own rows first, then "From other ontologies (N)" and "Not used (N)"
 * as collapsed sections, always collapsed when drawn;
 * deprecated rows greyed and struck through, with the reason as tooltip.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { groupMenuEntries, type MenuEntry } from '../../src/ui/propertyMenuGroups';
import { renderMenuGroups } from '../../src/ui/propertyMenuGroupsDom';

type P = { name: string; comment?: string };
const entry = (name: string, over: Partial<MenuEntry<P>> = {}): MenuEntry<P> => ({ item: { name }, source: null, deprecated: false, ...over });
const row = (x: MenuEntry<P>): HTMLElement => {
  const div = document.createElement('div');
  div.className = 'row';
  div.innerHTML = `<span class="prop-name">${x.item.name}</span>`;
  return div;
};
const render = (entries: MenuEntry<P>[]) => {
  const container = document.createElement('div');
  document.body.replaceChildren(container);
  renderMenuGroups(container, groupMenuEntries(entries), row);
  return container;
};
const group = (c: HTMLElement, g: string) => c.querySelector<HTMLDetailsElement>(`details[data-group="${g}"]`);

describe('renderMenuGroups (#137)', () => {
  beforeEach(() => localStorage.clear());

  it('shows the own rows first, then the others in a collapsed group, by source', () => {
    const c = render([entry('aprov:unit', { source: 'aprov' }), entry('title'), entry('geom:x', { source: 'geom' })]);
    expect([...c.children].map((el) => (el as HTMLElement).dataset.group ?? el.textContent)).toEqual(['title', 'external']);
    const external = group(c, 'external')!;
    expect(external.open).toBe(false);
    expect(external.querySelector('summary')!.textContent).toBe('From other ontologies (2)');
    expect([...external.querySelectorAll('.prop-menu-source')].map((el) => el.textContent)).toEqual(['aprov', 'geom']);
  });

  it('always starts its groups collapsed, also after the viewer opened them in an earlier render', () => {
    const c = render([entry('a'), entry('b', { source: 'x' }), entry('c', { unused: true })]);
    group(c, 'external')!.open = true;
    group(c, 'external')!.dispatchEvent(new Event('toggle'));
    const again = render([entry('a'), entry('b', { source: 'x' }), entry('c', { unused: true })]);
    expect(group(again, 'external')!.open).toBe(false);
    expect(group(again, 'unused')!.open).toBe(false);
  });

  it('puts what is used nowhere in its own collapsed group, "Not used"', () => {
    const c = render([entry('a'), entry('dcterms:license', { source: 'dcterms', unused: true })]);
    expect(group(c, 'unused')!.querySelector('summary')!.textContent).toBe('Not used (1)');
    expect(group(c, 'external')).toBeNull();
  });

  it('lists deprecated properties in a collapsed "Deprecated (N)" group, before "Not used"', () => {
    const c = render([entry('a'), entry('old', { deprecated: true }), entry('gone', { unused: true })]);
    expect([...c.querySelectorAll('details')].map((d) => [d.dataset.group, d.open, d.querySelector('summary')!.textContent])).toEqual([
      ['deprecated', false, 'Deprecated (1)'],
      ['unused', false, 'Not used (1)'],
    ]);
  });

  it('greys and strikes a deprecated row, marks it, and gives the reason as tooltip', () => {
    const c = render([entry('labellableRoot', { deprecated: true, item: { name: 'labellableRoot', comment: 'Deprecated: use isLabel.' } })]);
    const r = c.querySelector<HTMLElement>('.row')!;
    expect(r.classList.contains('prop-deprecated')).toBe(true);
    expect(r.querySelector<HTMLElement>('.prop-name')!.style.textDecoration).toBe('line-through');
    expect(r.querySelector('.prop-deprecated-mark')!.textContent).toBe('deprecated');
    expect(r.title).toBe('Deprecated: use isLabel.');
  });
});

