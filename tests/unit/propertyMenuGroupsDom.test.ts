// @vitest-environment jsdom
/**
 * The property menus' groups on the page (#137): own rows first, then "From other ontologies (N)" and "Not used
 * on any class (N)" as collapsed sections, open when something in them is in effect or the viewer left them open;
 * deprecated rows greyed and struck through, with the reason as tooltip.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { groupMenuEntries, type MenuEntry } from '../../src/ui/propertyMenuGroups';
import { renderMenuGroups, openGroupsInEffect } from '../../src/ui/propertyMenuGroupsDom';

type P = { name: string; comment?: string };
const entry = (name: string, over: Partial<MenuEntry<P>> = {}): MenuEntry<P> => ({ item: { name }, source: null, deprecated: false, ...over });
const row = (x: MenuEntry<P>): HTMLElement => {
  const div = document.createElement('div');
  div.className = 'row';
  div.innerHTML = `<span class="prop-name">${x.item.name}</span>`;
  return div;
};
const render = (entries: MenuEntry<P>[], menuId = 'dataProps') => {
  const container = document.createElement('div');
  document.body.replaceChildren(container);
  renderMenuGroups(container, groupMenuEntries(entries), row, menuId);
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

  it('opens a group that holds something in effect on the canvas', () => {
    expect(group(render([entry('a'), entry('b', { source: 'x', affectsCanvas: true })]), 'external')!.open).toBe(true);
  });

  it('remembers, per menu, a group the viewer opened', () => {
    const c = render([entry('a'), entry('b', { source: 'x' })]);
    const external = group(c, 'external')!;
    external.open = true;
    external.dispatchEvent(new Event('toggle'));
    expect(group(render([entry('a'), entry('b', { source: 'x' })]), 'external')!.open).toBe(true);
    expect(group(render([entry('a'), entry('b', { source: 'x' })], 'objectProps'), 'external')!.open).toBe(false);
  });

  it('puts what is used on no class in its own collapsed group', () => {
    const c = render([entry('a'), entry('dcterms:license', { source: 'dcterms', unused: true })]);
    expect(group(c, 'unused')!.querySelector('summary')!.textContent).toBe('Not used on any class (1)');
    expect(group(c, 'external')).toBeNull();
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

describe('openGroupsInEffect (#137)', () => {
  beforeEach(() => localStorage.clear());

  it('opens a group once a saved style in it is applied: a hidden relationship type, a regex rule', () => {
    const withControl = (html: string) => {
      const c = render([entry('a'), entry('b', { source: 'x' })]);
      group(c, 'external')!.querySelector('.row')!.insertAdjacentHTML('beforeend', html);
      return c;
    };
    const hidden = withControl('<input type="checkbox" class="edge-show-cb">');
    openGroupsInEffect(hidden);
    expect(group(hidden, 'external')!.open).toBe(true);
    const regex = withControl('<input class="ap-regex" value="^Plan">');
    openGroupsInEffect(regex);
    expect(group(regex, 'external')!.open).toBe(true);
    const nothing = withControl('<input type="checkbox" class="edge-show-cb" checked><input class="ap-regex" value="">');
    openGroupsInEffect(nothing);
    expect(group(nothing, 'external')!.open).toBe(false);
  });
});
