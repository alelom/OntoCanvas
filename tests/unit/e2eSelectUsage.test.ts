/**
 * A change to a shared file read "by usage" (#198): src/style.css, the page skeleton (src/ui/appShell.ts) and the shared state
 * (src/state/appState.ts). A changed line selects the areas of the feature modules that use the names on it: the class and id
 * names of a CSS rule, the ids and classes of the page markup, the state fields. A name no feature module uses selects
 * everything, as before.
 */
import { describe, it, expect } from 'vitest';
import { selectAreas, usageNames } from '../../scripts/e2eSelect.mjs';

const CSS = `.checks-tab,
.query-tab {
  display: flex;
}
/* The report (#231). */
.checks-result .checks-severity {
  color: red;
}
body {
  margin: 0;
}
@media (max-width: 600px) {
  #searchQuery {
    width: 100%;
  }
}
`;

const change = (added: string[], removed: string[] = [], after = CSS, before = CSS) => ({ added, removed, before, after });

describe('usageNames: CSS', () => {
  it('gives a changed declaration the class and id names of the rule it is in', () => {
    expect(usageNames('css', change(['  color: red;']))).toEqual({ names: { after: ['checks-result', 'checks-severity'], before: [] }, untraced: [] });
  });

  it('gives a changed selector line its own names, a line of a selector list too', () => {
    expect(usageNames('css', change(['.checks-tab,', '.query-tab {'])).names.after.sort()).toEqual(['checks-tab', 'query-tab']);
  });

  it('reads a rule inside @media, and looks up a removed line in the file before', () => {
    const before = CSS.replace('width: 100%', 'width: 50%');
    expect(usageNames('css', change(['    width: 100%;'], ['    width: 50%;'], CSS, before)).names).toEqual({ after: ['searchQuery'], before: ['searchQuery'] });
  });

  it('cannot trace a rule with no class or id (body), and skips comments and closing braces', () => {
    expect(usageNames('css', change(['  margin: 0;', '/* The report (#231). */', '}']))).toEqual({ names: { after: [], before: [] }, untraced: ['  margin: 0;'] });
  });
});

describe('usageNames: page markup and state fields', () => {
  it('gives a line of markup its ids, classes, label targets and data attributes', () => {
    const line = '<span id="relationshipNameMode" class="mode compact" data-mode-toggle hidden></span><label for="searchQuery">';
    expect(usageNames('markup', change([line])).names.after.sort()).toEqual(['compact', 'data-mode-toggle', 'mode', 'relationshipNameMode', 'searchQuery']);
  });

  it('gives a line of state the fields it declares', () => {
    expect(usageNames('fields', change(['  individualSearch: null as IndividualSearchFilter | null,', '  get relaxIndividuals() {'])).names.after.sort()).toEqual([
      '.individualSearch',
      '.relaxIndividuals',
    ]);
  });

  it('cannot trace a line of markup or state that names nothing', () => {
    expect(usageNames('markup', change(['  <div>'])).untraced).toEqual(['  <div>']);
    expect(usageNames('fields', change(['  return x + 1;'])).untraced).toEqual(['  return x + 1;']);
  });
});

describe('selectAreas with a file read by usage', () => {
  const config = {
    everything: ['src/style.css', 'src/graph/applyFilter.ts'],
    byUsage: { 'src/style.css': 'css' },
    ignore: [],
    areas: {
      sparql: { description: '', tests: ['checksPanel'], sources: ['src/ui/sidePanel/'] },
      search: { description: '', tests: ['searchScope'], sources: ['src/ui/searchAutocomplete.ts'] },
    },
  };
  const users: Record<string, string[]> = {
    'checks-result': ['src/ui/sidePanel/checksTab.ts'],
    'checks-severity': ['src/ui/sidePanel/checksTab.ts', 'tests/unit/checksTab.test.ts'],
    searchQuery: ['src/ui/searchAutocomplete.ts', 'src/graph/applyFilter.ts'],
    filterOnly: ['src/graph/applyFilter.ts'],
  };
  const usersOf = (name: string) => users[name] ?? [];
  const select = (added: string[], css = CSS) => selectAreas(['src/style.css'], config, () => [], null, () => change(added, [], css, css), new Set(), usersOf);

  it('selects the areas of the modules that use the names of the changed rule', () => {
    const selection = select(['  color: red;']);

    expect(selection.all).toBe(false);
    expect(selection.areas).toEqual(['sparql']);
    expect(selection.reasons.sparql).toEqual(['src/style.css (checks-result, checks-severity: src/ui/sidePanel/checksTab.ts)']);
  });

  it('leaves out a shared hub that uses a name when a feature module uses it too', () => {
    expect(select(['    width: 100%;']).areas).toEqual(['search']);
  });

  it('selects everything for a rule it cannot trace, a name no module uses, or one only a hub uses', () => {
    expect(select(['  margin: 0;']).all).toBe(true);
    expect(select(['  x: 1;'], '.nowhere {\n  x: 1;\n}\n').all).toBe(true);
    expect(select(['  x: 1;'], '.filterOnly {\n  x: 1;\n}\n').all).toBe(true);
  });
});

describe('usageNames: lines that name nothing of their own (#198)', () => {
  it('an import line of the state or the skeleton names nothing to look up, and is not untraced', () => {
    const found = usageNames('fields', change(["import type { SidePanel } from '../ui/sidePanel/initSidePanel';", "import { x } from './y';"]));

    expect(found).toEqual({ names: { after: [], before: [] }, untraced: [] });
  });

  it('gives a line of markup with no id the nearest element above it that has one', () => {
    const shell = `<div id="displayOptions" class="options">
  <label>
    <input type="checkbox">
    Spread individuals clear of classes
  </label>
</div>
`;
    const found = usageNames('markup', change(['    Spread individuals clear of classes', '</div>'], [], shell, shell));

    expect(found.names.after.sort()).toEqual(['displayOptions', 'options']);
    expect(found.untraced).toEqual([]);
  });
});

describe('selectAreas: a class built at run time (#198)', () => {
  it('a name no module spells is looked up by its prefix in a template, `checks-${`', () => {
    const config = {
      everything: ['src/style.css'],
      byUsage: { 'src/style.css': 'css' },
      ignore: [],
      areas: { sparql: { description: '', tests: ['checksPanel'], sources: ['src/ui/sidePanel/'] } },
    };
    // The CSS file spells the class itself: that is no use of it (#246: the fallback was skipped because of it).
    const users: Record<string, string[]> = { 'checks-warning': ['src/style.css'], 'checks-${': ['src/ui/sidePanel/checksTab.ts'] };
    const css = '.checks-warning .checks-severity {\n  color: orange;\n}\n';
    const selection = selectAreas(['src/style.css'], { ...config }, () => [], null, () => change(['  color: orange;'], [], css, css), new Set(), (name: string) =>
      name === 'checks-severity' ? ['src/ui/sidePanel/checksTab.ts'] : users[name] ?? []
    );

    expect(selection.all).toBe(false);
    expect(selection.areas).toEqual(['sparql']);
  });
});
