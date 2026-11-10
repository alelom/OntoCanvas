/**
 * A SHACL report as the Checks tab shows it (#231): grouped by the shape that was run, the worst first, with a line that says
 * what was found. Pure.
 */
import type { CheckReport, CheckResult, CheckTerm, PathStep, Severity } from './validateShapes';

export interface ShapeGroup {
  shape: CheckTerm;
  results: CheckResult[];
  counts: Record<Severity, number>;
}

const ORDER: Severity[] = ['Violation', 'Warning', 'Info'];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const zero = (): Record<Severity, number> => ({ Violation: 0, Warning: 0, Info: 0 });

/** By shape, in the order they were run; within one, violations first, then by focus node. */
export function groupByShape(results: CheckResult[]): ShapeGroup[] {
  const groups = new Map<string, ShapeGroup>();
  for (const result of results) {
    const key = `${result.shape.termType}:${result.shape.value}`;
    const group = groups.get(key) ?? { shape: result.shape, results: [], counts: zero() };
    group.results.push(result);
    group.counts[result.severity]++;
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.results.sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity) || a.focusNode.value.localeCompare(b.focusNode.value));
  }
  return [...groups.values()];
}

/** "2 violations, 1 warning", or "" for none. */
export function countsText(counts: Record<Severity, number>): string {
  return [
    counts.Violation ? plural(counts.Violation, 'violation', 'violations') : '',
    counts.Warning ? plural(counts.Warning, 'warning', 'warnings') : '',
    counts.Info ? plural(counts.Info, 'info', 'infos') : '',
  ]
    .filter(Boolean)
    .join(', ');
}

/** What a run found, in one line. */
export function reportSummary(report: CheckReport, took: string): string {
  const counts = zero();
  for (const result of report.results) counts[result.severity]++;
  const checked = `${plural(report.checked, 'shape', 'shapes')} checked in ${took}`;
  const notChecked = report.notChecked.length ? `; ${plural(report.notChecked.length, 'shape', 'shapes')} not checked (below)` : '';
  if (report.checked === 0) return `No shape could be checked${notChecked}.`;
  return report.conforms ? `Conforms: ${checked}${notChecked}.` : `${countsText(counts)}: ${checked}${notChecked}.`;
}

const QUANTIFIER: Record<PathStep['quantifier'], string> = { one: '', zeroOrOne: '?', zeroOrMore: '*', oneOrMore: '+' };

/** A path in the SPARQL property path syntax, each property named by `nameOf`: `^:inRoom`, `(:a|:b)`, `:a/:b*`. */
export function pathText(path: PathStep[], nameOf: (iri: string) => string): string {
  return path
    .map((step) => {
      const names = step.predicates.map(nameOf);
      const one = names.length > 1 ? `(${names.join('|')})` : names[0];
      return `${step.inverse ? '^' : ''}${one}${QUANTIFIER[step.quantifier]}`;
    })
    .join('/');
}
