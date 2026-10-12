import { describe, it, expect } from 'vitest';
import { Parser, type Quad } from 'n3';
import { structureSigner } from './blankNodes';
import { assignToStatements, statementTriples } from './splitSubjects';

const HEADER = '@prefix : <http://example.org/o#> . @prefix owl: <http://www.w3.org/2002/07/owl#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .';
const parse = (ttl: string): Quad[] => new Parser().parse(`${HEADER}\n${ttl}`);
const named = (quads: readonly Quad[]): Quad[] => quads.filter((q) => q.subject.termType === 'NamedNode');
const objects = (quads: readonly Quad[]): string[] => quads.map((q) => (q.object.termType === 'BlankNode' ? '[]' : q.object.value.split('#').pop()!));

const FIRST = ':A a owl:Class ; rdfs:label "A" .';
const SECOND = ':A rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :p ; owl:someValuesFrom :B ] .';

/** Share the triples of `current` (the whole store) between the FIRST and SECOND statements. */
function share(current: string): string[][] {
  const store = parse(current);
  const statements = [statementTriples(HEADER, FIRST)!, statementTriples(HEADER, SECOND)!];
  return assignToStatements(named(store), structureSigner(store), statements).map(objects);
}

describe('assignToStatements', () => {
  it('gives each statement the triples it holds, whatever the blank-node ids', () => {
    expect(share(`${FIRST}\n${SECOND}`)).toEqual([['Class', 'A'], ['[]']]);
  });

  it('gives an edited triple to the statement holding its predicate', () => {
    expect(share(`:A a owl:Class ; rdfs:label "Edited" .\n${SECOND}`)).toEqual([['Class', 'Edited'], ['[]']]);
    const editedRestriction = SECOND.replace(':B', ':C');
    expect(share(`${FIRST}\n${editedRestriction}`)).toEqual([['Class', 'A'], ['[]']]);
  });

  it('gives a triple with a new predicate to the first statement', () => {
    expect(share(`${FIRST}\n${SECOND}\n:A rdfs:comment "New" .`)).toEqual([['Class', 'A', 'New'], ['[]']]);
  });
});

describe('statementTriples', () => {
  it('is null for text that is not a statement on its own', () => {
    expect(statementTriples(HEADER, ':A rdfs:subClassOf [ a owl:Restriction ;')).toBeNull();
  });
});
