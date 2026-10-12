import { describe, it, expect } from 'vitest';
import { statementStartAfterPeriod } from './statementBoundaries';

const nextStatement = (line: string): string | null => {
  const found = statementStartAfterPeriod(line);
  return found ? line.slice(found.next) : null;
};

describe('statementStartAfterPeriod (#124)', () => {
  it('finds a statement that starts right after the previous one ends', () => {
    expect(nextStatement('    rdfs:subClassOf _:df_0_2, _:df_0_3.:RevisionTable rdf:type owl:Class;')).toBe(':RevisionTable rdf:type owl:Class;');
    expect(nextStatement(':A :p :o . :B :p "x"@en.:C :p :o .')).toBe(':B :p "x"@en.:C :p :o .');
    expect(nextStatement('    rdfs:label "x".<http://example.org/B> a owl:Class .')).toBe('<http://example.org/B> a owl:Class .');
  });

  it('ignores a `.` that belongs to a name, a number, a string, an IRI or a comment', () => {
    for (const line of [
      '    rdfs:subClassOf ex:a.b ;',
      '    :weight 1.5 ;',
      '    rdfs:label "Ends. Then more" ;',
      '    owl:imports <http://example.org/a.ttl> ;',
      '    :p _:b.c ;',
      '    rdfs:label "x" . # done. really',
      '    rdfs:comment "x" .',
    ]) {
      expect(nextStatement(line), line).toBeNull();
    }
  });

  it('finds a statement after the `] .` or `) .` that closes a bracket opened on an earlier line', () => {
    expect(nextStatement('] . :B a owl:Class .')).toBe(':B a owl:Class .');
    expect(nextStatement('    :q :r ] ) . :B a owl:Class .')).toBe(':B a owl:Class .');
  });

  it('ignores a `.` inside brackets', () => {
    expect(nextStatement('    :p [ :q "a" ] .')).toBeNull();
  });
});
