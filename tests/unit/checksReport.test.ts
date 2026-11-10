/** A SHACL report as the Checks tab shows it (#231): by shape, the worst first, a summary line, and paths as SPARQL writes them. */
import { describe, it, expect } from 'vitest';
import { countsText, groupByShape, pathText, reportSummary } from '../../src/checks/checksReport';
import type { CheckResult } from '../../src/checks/validateShapes';

const NS = 'http://example.org/d#';
const result = (shape: string, severity: CheckResult['severity'], focus: string): CheckResult => ({
  shape: { termType: 'NamedNode', value: NS + shape },
  severity,
  focusNode: { termType: 'NamedNode', value: NS + focus },
  path: null,
  value: null,
  message: '',
  constraint: 'MinCountConstraintComponent',
});

describe('groupByShape', () => {
  it('groups by shape in the order they were run, violations first, each with its counts', () => {
    const groups = groupByShape([result('A', 'Warning', 'a'), result('B', 'Violation', 'z'), result('A', 'Violation', 'b'), result('A', 'Violation', 'a')]);

    expect(groups.map((g) => g.shape.value)).toEqual([NS + 'A', NS + 'B']);
    expect(groups[0].results.map((r) => [r.severity, r.focusNode.value.slice(NS.length)])).toEqual([['Violation', 'a'], ['Violation', 'b'], ['Warning', 'a']]);
    expect(groups[0].counts).toEqual({ Violation: 2, Warning: 1, Info: 0 });
  });
});

describe('countsText', () => {
  it('names each severity found', () => {
    expect(countsText({ Violation: 2, Warning: 1, Info: 0 })).toBe('2 violations, 1 warning');
    expect(countsText({ Violation: 0, Warning: 0, Info: 1 })).toBe('1 info');
  });
});

describe('reportSummary', () => {
  it('says the data conforms, or what was found, how many shapes were checked, and those that were not', () => {
    expect(reportSummary({ results: [], checked: 3, notChecked: [], conforms: true }, '12 ms')).toBe('Conforms: 3 shapes checked in 12 ms.');
    expect(reportSummary({ results: [result('A', 'Violation', 'a')], checked: 1, notChecked: [{ termType: 'NamedNode', value: NS + 'S' }], conforms: false }, '5 ms')).toBe(
      '1 violation: 1 shape checked in 5 ms; 1 shape not checked (below).'
    );
    expect(reportSummary({ results: [], checked: 0, notChecked: [{ termType: 'NamedNode', value: NS + 'S' }], conforms: true }, '1 ms')).toBe(
      'No shape could be checked; 1 shape not checked (below).'
    );
  });
});

describe('pathText', () => {
  const nameOf = (iri: string) => `:${iri.slice(NS.length)}`;

  it('writes a path as SPARQL does', () => {
    expect(pathText([{ predicates: [NS + 'inRoom'], inverse: true, quantifier: 'one' }], nameOf)).toBe('^:inRoom');
    expect(pathText([{ predicates: [NS + 'a', NS + 'b'], inverse: false, quantifier: 'one' }], nameOf)).toBe('(:a|:b)');
    expect(
      pathText(
        [
          { predicates: [NS + 'a'], inverse: false, quantifier: 'one' },
          { predicates: [NS + 'b'], inverse: false, quantifier: 'zeroOrMore' },
        ],
        nameOf
      )
    ).toBe(':a/:b*');
  });
});
