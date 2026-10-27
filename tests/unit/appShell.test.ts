// @vitest-environment jsdom
/**
 * The page markup (moved out of main.ts, #175). Every E2E test and `getElementById` call in the app relies on it,
 * so these pin the parts nothing may lose: the regions, unique ids, and the debug-only serializer choice.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const debug = vi.hoisted(() => ({ on: false }));
vi.mock('../../src/utils/debug', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/debug')>()),
  isDebugMode: () => debug.on,
}));

import { renderApp } from '../../src/ui/appShell';

const render = () => {
  document.body.innerHTML = '<div id="app"></div>';
  renderApp();
  return document.getElementById('app')!;
};

beforeEach(() => {
  debug.on = false;
});

describe('renderApp', () => {
  it('draws the toolbar, the graph container and the bottom bar into #app', () => {
    const app = render();
    for (const id of ['controls', 'openOntologyBtn', 'vizControls', 'networkWrapper', 'network', 'info', 'nodeCount', 'edgeCount']) {
      expect(app.querySelector(`#${id}`), id).not.toBeNull();
    }
  });

  it('draws the modals the app opens', () => {
    const app = render();
    for (const id of ['renameModal', 'addNodeModal']) {
      expect(app.querySelector(`#${id}`), id).not.toBeNull();
    }
  });

  it('gives no id to two elements', () => {
    const app = render();
    const ids = [...app.querySelectorAll('[id]')].map((el) => el.id);
    const duplicated = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(ids.length).toBeGreaterThan(100);
    expect(duplicated).toEqual([]);
  });

  it('shows the logo from the build base URL', () => {
    const app = render();
    expect(app.querySelector('#openOntologyBtn img')?.getAttribute('src')).toMatch(/OntoCanvas\.png$/);
  });

  it('offers the serializer choice in debug mode only', () => {
    expect(render().querySelector('#serializerSelect')).toBeNull();
    debug.on = true;
    expect(render().querySelector('#serializerSelect')).not.toBeNull();
  });

  it('replaces what was in #app when drawn again', () => {
    render();
    const app = render();
    expect(app.querySelectorAll('#controls')).toHaveLength(1);
  });
});
