/**
 * A change to a wiring file (src/main.ts, #198) selects the areas of the modules its changed lines use, instead of every area:
 * the names on a changed line are traced to the modules the file imports them from. Anything that cannot be traced still
 * selects everything.
 */
import { describe, it, expect } from 'vitest';
import { selectAreas, wiringModules } from '../../scripts/e2eSelect.mjs';

const MAIN = `import { applyFilter } from './graph/applyFilter';
import { showResultInGraph, clearResultInGraph } from './graph/showResultInGraph';
import { initSidePanel } from './ui/sidePanel/initSidePanel';
import { setupSearch as search } from './ui/search';
import type { Thing } from './types';

const panel = initSidePanel({
  showResult: showResultInGraph,
  clearResult: clearResultInGraph,
});
search(panel);
applyFilter();
`;

const known = new Set(['src/graph/applyFilter.ts', 'src/graph/showResultInGraph.ts', 'src/ui/sidePanel/initSidePanel.ts', 'src/ui/search.ts', 'src/types.ts']);

describe('wiringModules: the modules the changed lines of a wiring file use', () => {
  it('traces the names on a changed line to the modules they are imported from', () => {
    const found = wiringModules('src/main.ts', { added: ['  showResult: showResultInGraph,'], removed: [], before: MAIN, after: MAIN }, known);

    expect(found).toEqual({ modules: ['src/graph/showResultInGraph.ts'], untraced: [] });
  });

  it('takes the module of an import line, added or removed, and a renamed import by its local name', () => {
    const found = wiringModules(
      'src/main.ts',
      { added: ["import { clearResultInGraph } from './graph/showResultInGraph';", 'search(panel);'], removed: ["import { old } from './ui/old';"], before: MAIN, after: MAIN },
      new Set([...known, 'src/ui/old.ts'])
    );

    expect(found.modules.sort()).toEqual(['src/graph/showResultInGraph.ts', 'src/ui/old.ts', 'src/ui/search.ts']);
    expect(found.untraced).toEqual([]);
  });

  it('ignores blank and comment lines, and says which lines it cannot trace', () => {
    const found = wiringModules('src/main.ts', { added: ['', '  // the result is outlined (#207)', ' * more', 'const x = 1 + 2;'], removed: [], before: MAIN, after: MAIN }, known);

    expect(found).toEqual({ modules: [], untraced: ['const x = 1 + 2;'] });
  });

  it('a type-only import line selects nothing', () => {
    expect(wiringModules('src/main.ts', { added: ["import type { Thing } from './types';"], removed: [], before: MAIN, after: MAIN }, known)).toEqual({ modules: [], untraced: [] });
  });
});

describe('selectAreas with a wiring file', () => {
  const config = {
    everything: ['src/main.ts', 'src/graph/applyFilter.ts'],
    wiring: ['src/main.ts'],
    ignore: [],
    areas: {
      sparql: { description: '', tests: ['sparqlPanel'], sources: ['src/graph/showResultInGraph.ts', 'src/ui/sidePanel/'] },
      search: { description: '', tests: ['searchScope'], sources: ['src/ui/search.ts'] },
      shell: { description: '', tests: ['statusBar'], sources: ['src/ui/statusBar.ts'] },
    },
  };
  const lines = (added: string[]) => () => ({ added, removed: [], before: MAIN, after: MAIN });

  it('selects the areas of the modules the changed lines use', () => {
    const selection = selectAreas(['src/main.ts'], config, () => [], null, lines(['  showResult: showResultInGraph,', 'search(panel);']), known);

    expect(selection.all).toBe(false);
    expect(selection.areas).toEqual(['sparql', 'search']);
    expect(selection.reasons.sparql).toEqual(['src/main.ts (wires src/graph/showResultInGraph.ts)']);
  });

  it('selects everything for a line it cannot trace, or one that uses a hub', () => {
    expect(selectAreas(['src/main.ts'], config, () => [], null, lines(['const x = 1;']), known).all).toBe(true);
    expect(selectAreas(['src/main.ts'], config, () => [], null, lines(['applyFilter();']), known).all).toBe(true);
  });

  it('selects everything without the changed lines, as before', () => {
    expect(selectAreas(['src/main.ts'], config, () => []).all).toBe(true);
  });
});

describe('wiringModules: lines that name no feature of their own (#198)', () => {
  const WIRED = `import { initSidePanel } from './ui/sidePanel/initSidePanel';
import { session } from './state/appState';
import { currentGraphIndex } from './graph/drawnGraphIndex';

const panel = initSidePanel({
  getGraph: () => {
    const drawn = session.currentGraphDataForBuild;
    return drawn;
  },
  embedded: false,
});
session.ready = true;
`;
  const knownHere = new Set(['src/ui/sidePanel/initSidePanel.ts', 'src/state/appState.ts', 'src/graph/drawnGraphIndex.ts']);
  const isHub = (module: string) => module.startsWith('src/state/');
  const change = (removed: string[], added: string[] = []) => ({ added, removed, before: WIRED, after: WIRED });

  it('gives a line with no imported name to the call it is inside', () => {
    expect(wiringModules('src/main.ts', change(['  getGraph: () => {', '  embedded: false,']), knownHere, { isHub })).toEqual({ modules: ['src/ui/sidePanel/initSidePanel.ts'], untraced: [] });
  });

  it('does not take shared state for the feature: a line that reads it is given to the call it is inside', () => {
    expect(wiringModules('src/main.ts', change(['    const drawn = session.currentGraphDataForBuild;']), knownHere, { isHub })).toEqual({ modules: ['src/ui/sidePanel/initSidePanel.ts'], untraced: [] });
  });

  it('keeps a line that names a feature beside shared state to that feature', () => {
    expect(wiringModules('src/main.ts', change([], ['  getGraph: currentGraphIndex ?? session.x,']), knownHere, { isHub })).toEqual({ modules: ['src/graph/drawnGraphIndex.ts'], untraced: [] });
  });

  it('cannot trace a line at the top level that names only shared state', () => {
    expect(wiringModules('src/main.ts', change([], ['session.ready = true;']), knownHere, { isHub })).toEqual({ modules: [], untraced: ['session.ready = true;'] });
  });
});
