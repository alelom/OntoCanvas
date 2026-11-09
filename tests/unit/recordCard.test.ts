/**
 * The record card of an individual (#229): its statements grouped by property, the named graphs they come from, and the way back
 * and forward between cards. Pure.
 */
import { describe, it, expect } from 'vitest';
import { createCardHistory, graphsOf, groupByPredicate } from '../../src/abox/recordCard';
import type { DescribedLink } from '../../src/abox/individualIndex';

const link = (predicate: string, value: string, graph = ''): DescribedLink => ({
  subject: 'a',
  predicate,
  object: { termType: 'Literal', value },
  objectIsIndividual: false,
  graph,
});

describe('groupByPredicate', () => {
  it('puts the values of a repeated property in one row, in the order the links come', () => {
    const groups = groupByPredicate([link('p', '1'), link('p', '2'), link('q', '3')]);

    expect(groups.map((g) => [g.predicate, g.links.map((l) => l.object.value)])).toEqual([
      ['p', ['1', '2']],
      ['q', ['3']],
    ]);
  });

  it('is empty for no links', () => {
    expect(groupByPredicate([])).toEqual([]);
  });
});

describe('graphsOf', () => {
  it('lists the graphs the statements come from, the default graph as empty, once each', () => {
    expect(graphsOf([link('p', '1', 'g1'), link('p', '2', ''), link('q', '3', 'g1')])).toEqual(['g1', '']);
  });
});

describe('createCardHistory', () => {
  it('goes back and forward between the cards visited', () => {
    const history = createCardHistory();
    history.visit('a');
    history.visit('b');
    history.visit('c');

    expect(history.back()).toBe('b');
    expect(history.back()).toBe('a');
    expect(history.canBack()).toBe(false);
    expect(history.back()).toBe('a');
    expect(history.forward()).toBe('b');
    expect(history.canForward()).toBe(true);
  });

  it('drops the cards ahead when another is visited after going back, as a browser does', () => {
    const history = createCardHistory();
    history.visit('a');
    history.visit('b');
    history.back();
    history.visit('c');

    expect(history.canForward()).toBe(false);
    expect(history.back()).toBe('a');
  });

  it('does not repeat the card shown when it is visited again', () => {
    const history = createCardHistory();
    history.visit('a');
    history.visit('a');

    expect(history.canBack()).toBe(false);
  });

  it('forgets the cards of individuals that are gone, and keeps its place among the rest', () => {
    const history = createCardHistory();
    for (const iri of ['a', 'b', 'c', 'd']) history.visit(iri);
    history.back(); // on c

    history.keep((iri) => iri !== 'b');

    expect(history.current()).toBe('c');
    expect(history.back()).toBe('a');
    expect(history.forward()).toBe('c');
    expect(history.forward()).toBe('d');
  });

  it('has no card when every one is gone, or after clear', () => {
    const history = createCardHistory();
    history.visit('a');
    history.keep(() => false);
    expect(history.current()).toBeNull();
    history.visit('b');
    history.clear();
    expect(history.current()).toBeNull();
  });
});
