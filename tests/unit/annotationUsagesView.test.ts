// @vitest-environment jsdom
/**
 * Where an annotation property is used, on the page (#139): the dialog's collapsed section and the menu's popover.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { fillUsagesSection, renderAnnotationUsages, toggleUsagesPopover } from '../../src/ui/annotationUsagesView';

const USAGES = [
  { subject: 'http://example.org/u#Room', label: 'Room', kind: 'class', values: ['a room', 'a <space>'] },
  { subject: 'http://example.org/u', label: 'u', kind: 'ontology', values: ['about'] },
];
const lines = (el: Element) => [...el.querySelectorAll('.annotation-usage')].map((li) => li.textContent);

describe('annotation usages on the page (#139)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('lists each term with its kind and values, as text (values are not markup)', () => {
    const el = document.createElement('div');
    renderAnnotationUsages(el, USAGES);
    expect(lines(el)).toEqual(['Room (class): a room, a <space>', 'u (ontology): about']);
    expect(el.querySelector('li')!.title).toBe('http://example.org/u#Room');
  });

  it('says "Not used" when there is no usage', () => {
    const el = document.createElement('div');
    renderAnnotationUsages(el, []);
    expect(el.textContent).toBe('Not used');
  });

  it('fills the dialog section, collapsed, with the count in its title', () => {
    document.body.innerHTML = '<details open><summary></summary><div class="annotation-usages-list"></div></details>';
    const details = document.querySelector('details')!;
    fillUsagesSection(details, USAGES);
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')!.textContent).toBe('Where it is used (2)');
    expect(lines(details)).toHaveLength(2);
  });

  it('shows the popover for a property, and hides it on a second click', () => {
    const anchor = document.createElement('button');
    anchor.className = 'ap-usages-btn';
    document.body.appendChild(anchor);
    toggleUsagesPopover(anchor, 'hint', USAGES);
    const popover = document.getElementById('annotationUsagesPopover')!;
    expect(popover.style.display).toBe('block');
    expect(popover.textContent).toContain('Where hint is used (2)');
    toggleUsagesPopover(anchor, 'hint', USAGES);
    expect(popover.style.display).toBe('none');
  });
});
