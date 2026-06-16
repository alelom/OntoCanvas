// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Store, DataFactory } from 'n3';
import {
  initAnnotationPropsMenu,
  getAnnotationStyleConfig,
  applyAnnotationStyleConfigToDom,
  type AnnotationPropsMenuDeps,
} from '../../src/ui/annotationPropertiesMenu';
import type { AnnotationPropertyInfo } from '../../src/types';
import type { AnnotationStyleConfig } from '../../src/ui/constants';

const { namedNode } = DataFactory;
const OWL = 'http://www.w3.org/2002/07/owl#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const BASE = 'http://example.org/o#';

function makeStore(names: string[]): Store {
  const store = new Store();
  for (const n of names) {
    store.addQuad(namedNode(BASE + n), namedNode(RDF + 'type'), namedNode(OWL + 'AnnotationProperty'));
    store.addQuad(namedNode(BASE + n), namedNode(RDFS + 'label'), DataFactory.literal(n));
  }
  return store;
}

interface DepState {
  props: AnnotationPropertyInfo[];
  onApply: number;
  unsaved: number;
  save: number;
  edited: string | null;
  undos: Array<{ undo: () => void; redo: () => void }>;
}

function makeDeps(
  props: AnnotationPropertyInfo[],
  store: Store
): { deps: AnnotationPropsMenuDeps; state: DepState } {
  const state: DepState = { props: [...props], onApply: 0, unsaved: 0, save: 0, edited: null, undos: [] };
  const deps: AnnotationPropsMenuDeps = {
    getAnnotationProperties: () => state.props,
    setAnnotationProperties: (p) => {
      state.props = p;
    },
    getTtlStore: () => store,
    getExternalRefs: () => [],
    onApply: () => {
      state.onApply++;
    },
    showEditModal: (n) => {
      state.edited = n;
    },
    markUnsaved: () => {
      state.unsaved++;
    },
    scheduleSave: () => {
      state.save++;
    },
    pushUndoable: (undo, redo) => {
      state.undos.push({ undo, redo });
    },
  };
  return { deps, state };
}

const boolProp = (name: string): AnnotationPropertyInfo => ({ name, isBoolean: true, uri: BASE + name });
const textProp = (name: string): AnnotationPropertyInfo => ({ name, isBoolean: false, uri: BASE + name });

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  // jsdom does not implement confirm(); default to "yes" so delete proceeds.
  globalThis.confirm = () => true;
});

describe('annotationPropertiesMenu - rendering', () => {
  it('renders a row with edit, delete, and reorder controls per property', () => {
    const { deps } = makeDeps([boolProp('flagA'), textProp('status')], makeStore(['flagA', 'status']));
    initAnnotationPropsMenu(container, deps);

    expect(container.querySelectorAll('.annotation-prop-delete-btn').length).toBe(2);
    expect(container.querySelectorAll('.annotation-prop-edit-btn').length).toBe(2);
    expect(container.querySelectorAll('.ap-move-up').length).toBe(2);
    expect(container.querySelectorAll('.ap-move-down').length).toBe(2);
    expect(container.textContent).toContain('Boolean properties');
    expect(container.textContent).toContain('Text properties');
  });

  it('shows a placeholder when there are no properties', () => {
    const { deps } = makeDeps([], makeStore([]));
    initAnnotationPropsMenu(container, deps);
    expect(container.textContent).toContain('No annotation properties');
  });

  it('disables move-up on the first and move-down on the last property in a section', () => {
    const { deps } = makeDeps([boolProp('a'), boolProp('b')], makeStore(['a', 'b']));
    initAnnotationPropsMenu(container, deps);
    const ups = container.querySelectorAll('.ap-move-up');
    const downs = container.querySelectorAll('.ap-move-down');
    expect((ups[0] as HTMLButtonElement).disabled).toBe(true);
    expect((ups[1] as HTMLButtonElement).disabled).toBe(false);
    expect((downs[0] as HTMLButtonElement).disabled).toBe(false);
    expect((downs[1] as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('annotationPropertiesMenu - delete', () => {
  it('removes the property from the store and the list, and is undoable', () => {
    const store = makeStore(['flagA']);
    const { deps, state } = makeDeps([boolProp('flagA')], store);
    initAnnotationPropsMenu(container, deps);

    (container.querySelector('.annotation-prop-delete-btn') as HTMLElement).click();

    expect(store.getQuads(namedNode(BASE + 'flagA'), null, null, null).length).toBe(0);
    expect(state.props.find((p) => p.name === 'flagA')).toBeUndefined();
    expect(state.unsaved).toBeGreaterThan(0);
    expect(state.undos.length).toBe(1);

    // Undo restores it.
    state.undos[0].undo();
    expect(store.getQuads(namedNode(BASE + 'flagA'), null, null, null).length).toBeGreaterThan(0);
    expect(state.props.find((p) => p.name === 'flagA')).toBeDefined();
  });

  it('does nothing when the user cancels the confirm', () => {
    globalThis.confirm = () => false;
    const store = makeStore(['flagA']);
    const { deps, state } = makeDeps([boolProp('flagA')], store);
    initAnnotationPropsMenu(container, deps);

    (container.querySelector('.annotation-prop-delete-btn') as HTMLElement).click();

    expect(store.getQuads(namedNode(BASE + 'flagA'), null, null, null).length).toBeGreaterThan(0);
    expect(state.props.length).toBe(1);
  });
});

describe('annotationPropertiesMenu - reorder', () => {
  it('moves a boolean property down in priority and recolours', () => {
    const { deps, state } = makeDeps([boolProp('a'), boolProp('b')], makeStore(['a', 'b']));
    initAnnotationPropsMenu(container, deps);

    const beforeApply = state.onApply;
    (container.querySelectorAll('.ap-move-down')[0] as HTMLElement).click();

    expect(state.props.map((p) => p.name)).toEqual(['b', 'a']);
    expect(state.save).toBeGreaterThan(0);
    expect(state.onApply).toBeGreaterThan(beforeApply);
  });
});

describe('annotationPropertiesMenu - edit', () => {
  it('opens the edit modal for the clicked property', () => {
    const { deps, state } = makeDeps([boolProp('flagA')], makeStore(['flagA']));
    initAnnotationPropsMenu(container, deps);
    (container.querySelector('.annotation-prop-edit-btn') as HTMLElement).click();
    expect(state.edited).toBe('flagA');
  });
});

describe('annotationPropertiesMenu - config read/write', () => {
  it('round-trips a config through applyAnnotationStyleConfigToDom -> getAnnotationStyleConfig', () => {
    const props = [boolProp('flagA')];
    const { deps } = makeDeps(props, makeStore(['flagA']));
    initAnnotationPropsMenu(container, deps);

    const desired: AnnotationStyleConfig = {
      booleanProps: {
        flagA: {
          whenTrue: { fillColor: '#112233', borderColor: '#445566', borderLineType: 'dotted', show: false },
          whenFalse: { fillColor: '#778899', borderColor: '#aabbcc', borderLineType: 'dashed', show: true },
          whenUndefined: { fillColor: '#ddeeff', borderColor: '#001122', borderLineType: 'solid', show: true },
        },
      },
      textProps: {},
    };
    applyAnnotationStyleConfigToDom(container, desired, props);

    const read = getAnnotationStyleConfig(container, props);
    expect(read.booleanProps.flagA.whenTrue.fillColor).toBe('#112233');
    expect(read.booleanProps.flagA.whenTrue.borderColor).toBe('#445566');
    expect(read.booleanProps.flagA.whenTrue.show).toBe(false);
    expect(read.booleanProps.flagA.whenTrue.borderLineType).toBe('dotted');
    expect(read.booleanProps.flagA.whenFalse.fillColor).toBe('#778899');
  });

  it('gives two boolean properties distinct default "when true" fills', () => {
    const props = [boolProp('a'), boolProp('b')];
    const { deps } = makeDeps(props, makeStore(['a', 'b']));
    initAnnotationPropsMenu(container, deps);

    const cfg = getAnnotationStyleConfig(container, props);
    expect(cfg.booleanProps.a.whenTrue.fillColor).toBe('#2ecc71'); // first stays green
    expect(cfg.booleanProps.b.whenTrue.fillColor).not.toBe(cfg.booleanProps.a.whenTrue.fillColor);
  });

  it('preserves the user picked colour across a reorder re-render', () => {
    const { deps } = makeDeps([boolProp('a'), boolProp('b')], makeStore(['a', 'b']));
    initAnnotationPropsMenu(container, deps);

    // User picks a custom fill for a.whenTrue.
    const fillA = container.querySelector('.ap-bool-fill[data-prop="a"][data-val="true"]') as HTMLInputElement;
    fillA.value = '#abcdef';

    // Reorder b above a.
    (container.querySelectorAll('.ap-move-down')[0] as HTMLElement).click();

    // a's custom fill must survive the re-render.
    const fillAAfter = container.querySelector('.ap-bool-fill[data-prop="a"][data-val="true"]') as HTMLInputElement;
    expect(fillAAfter.value).toBe('#abcdef');
  });
});
