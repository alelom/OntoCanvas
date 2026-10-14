// @vitest-environment jsdom
/**
 * "Set annotation properties" in the class dialogs (#141): a scrollable list, grouped like the Annotation
 * Properties menu (#137): own first, others by source, those used nowhere last ("Not used"), deprecated ones marked; a group
 * holding a value set on this class starts open.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderRenameModalAnnotationPropsList, renderAddNodeAnnotationPropsList, type AnnotationPropsListDeps } from '../../src/ui/nodeModalFormUi';
import type { AnnotationPropertyInfo, GraphNode } from '../../src/types';

const prop = (name: string, isBoolean: boolean, over: Partial<AnnotationPropertyInfo> = {}): AnnotationPropertyInfo => ({ name, isBoolean, uri: `http://example.org/o#${name}`, ...over });
const PROPS = [
  prop('isLabel', true),
  prop('skos:altLabel', false),
  prop('labellableRoot', true, { deprecated: true, comment: 'Deprecated: use isLabel.' }),
  prop('dcterms:license', false),
];
const FACTS: Record<string, { source: string | null; unused: boolean }> = {
  isLabel: { source: null, unused: false },
  'skos:altLabel': { source: 'skos', unused: false },
  labellableRoot: { source: null, unused: true },
  'dcterms:license': { source: 'dcterms', unused: false },
};
const deps = (values: Record<string, string[]> = {}): AnnotationPropsListDeps => ({
  getInitialValues: (ap) => values[ap.name] ?? [],
  onTextualValuesChange: () => {},
  onOpenLink: () => {},
  groupFacts: (ap) => ({ ...FACTS[ap.name], deprecated: !!ap.deprecated }),
});
const list = () => document.getElementById('renameAnnotationPropsList')!;
const names = (el: Element) => [...el.querySelectorAll('.prop-name')].map((n) => n.textContent!.replace(/:$/, ''));
const group = (g: string) => list().querySelector<HTMLDetailsElement>(`details[data-group="${g}"]`)!;

describe('Set annotation properties: scrollable and grouped (#141)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="renameAnnotationPropsList"></div><div id="addNodeAnnotationPropsList"></div>';
  });

  it('lists own properties first, the others in collapsed groups, the deprecated one marked', () => {
    renderRenameModalAnnotationPropsList('A', { id: 'A', label: 'A', labellableRoot: null } as GraphNode, PROPS, deps());
    expect(names(list())[0]).toBe('isLabel');
    expect(group('external').open).toBe(false);
    expect(names(group('external'))).toEqual(['dcterms:license', 'skos:altLabel']);
    expect(names(group('unused'))).toEqual(['labellableRoot']);
    expect(group('unused').querySelector('summary')!.textContent).toBe('Not used (1)');
    expect(group('unused').querySelector('.prop-deprecated')!.getAttribute('title')).toBe('Deprecated: use isLabel.');
  });

  it('scrolls instead of growing the dialog', () => {
    renderAddNodeAnnotationPropsList(PROPS, deps());
    const el = document.getElementById('addNodeAnnotationPropsList')!;
    expect(el.style.overflowY).toBe('auto');
    expect(el.style.maxHeight).not.toBe('');
  });

  it('opens a group holding a value set on this class', () => {
    renderRenameModalAnnotationPropsList('A', { id: 'A', label: 'A', labellableRoot: null } as GraphNode, PROPS, deps({ 'skos:altLabel': ['Space'] }));
    expect(group('external').open).toBe(true);
    expect(group('unused').open).toBe(false);
  });
});

describe('Set annotation properties: names as in the menu (#137 follow-up)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="renameAnnotationPropsList"></div>';
  });

  it('shows every name in bold, Boolean and text alike, with its prefix when it has one', () => {
    const withNames: AnnotationPropsListDeps = { ...deps(), displayName: (ap) => (ap.name === 'altLabel' ? 'skos:altLabel' : ap.name) };
    renderRenameModalAnnotationPropsList('A', { id: 'A', label: 'A', labellableRoot: null } as GraphNode, [prop('isLabel', true), prop('altLabel', false)], withNames);
    const nameEls = [...document.querySelectorAll<HTMLElement>('#renameAnnotationPropsList .prop-name')];
    expect(nameEls.map((n) => n.textContent)).toEqual(['isLabel', 'skos:altLabel:']);
    expect(nameEls.every((n) => n.style.fontWeight === 'bold')).toBe(true);
  });
});
