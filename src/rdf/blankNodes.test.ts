import { describe, it, expect } from 'vitest';
import { Parser, type Quad } from 'n3';
import { blankNodeClosureQuads, blockStructurallyChanged } from './blankNodes';

const PREFIXES = '@prefix : <http://example.org/o#> . @prefix owl: <http://www.w3.org/2002/07/owl#> .\n';
const parse = (ttl: string, blankNodePrefix?: string): Quad[] => new Parser({ blankNodePrefix }).parse(PREFIXES + ttl);

describe('blankNodeClosureQuads', () => {
  it('reaches the RDF list inside a class expression, however deep', () => {
    const all = parse(':p :domain [ a owl:Class ; owl:unionOf ( :A [ owl:complementOf :B ] ) ] .');
    const named = all.filter((q) => q.subject.termType === 'NamedNode');
    const about = (b: Quad['object']): Quad[] => all.filter((q) => q.subject.equals(b));
    expect(blankNodeClosureQuads(named, about)).toHaveLength(all.length - named.length);
  });

  it('leaves out triples it was already given', () => {
    const all = parse(':p :domain [ owl:unionOf ( :A :B ) ] .');
    const about = (b: Quad['object']): Quad[] => all.filter((q) => q.subject.equals(b));
    expect(blankNodeClosureQuads(all, about)).toEqual([]);
  });
});

describe('blockStructurallyChanged', () => {
  it('is false when only blank-node ids differ', () => {
    const ttl = ':p :domain [ owl:unionOf ( :A :B ) ] .';
    expect(blockStructurallyChanged(parse(ttl), parse(ttl, 'other'))).toBe(false);
  });

  it('is true when a list member changes', () => {
    expect(blockStructurallyChanged(parse(':p :domain [ owl:unionOf ( :A :B ) ] .'), parse(':p :domain [ owl:unionOf ( :A :C ) ] .'))).toBe(true);
  });

  it('is true when a blank node that is part of a cycle changes, though no blank node is a root', () => {
    const cycle = (label: string): Quad[] => parse(`_:b1 :p _:b2 ; :label "${label}" . _:b2 :p _:b1 .`);
    expect(blockStructurallyChanged(cycle('x'), cycle('x'))).toBe(false);
    expect(blockStructurallyChanged(cycle('x'), cycle('y'))).toBe(true);
  });

  it('is true when two lists swap members, though each list node still looks the same on its own', () => {
    const before = parse(':p :domain [ owl:unionOf ( :A :B ) ] ; :range [ owl:unionOf ( :C :D ) ] .');
    const after = parse(':p :domain [ owl:unionOf ( :A :D ) ] ; :range [ owl:unionOf ( :C :B ) ] .');
    expect(blockStructurallyChanged(before, after)).toBe(true);
  });
});
