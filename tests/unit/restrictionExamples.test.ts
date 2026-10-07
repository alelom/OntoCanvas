import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/parser';
import { getEdgeDisplayLabel } from '../../src/ui/relationshipUtils';

const EXAMPLES = join(dirname(fileURLToPath(import.meta.url)), '../../examples');
const load = (path: string) => parseRdfToGraph(readFileSync(join(EXAMPLES, path), 'utf-8'), { path });

/** The hand-testing examples linked from the #63 PR must keep producing what their comments promise. */
describe('examples for #63', () => {
  it('restrictions/restriction-kinds.ttl labels one restriction of each kind', async () => {
    const r = await load('restrictions/restriction-kinds.ttl');
    const labels = r.graphData.edges
      .filter((e) => e.isRestriction)
      .map((e) => `${e.from}->${e.to} ${getEdgeDisplayLabel(e, r.objectProperties, [])}`)
      .sort();
    expect(labels).toEqual([
      'Building->Floor ∀ hasFloor',
      'DrawingSet->Sheet contains [1..*]',
      'Person->Person ⟲ knows',
      'Room->Wall ∃∀ hasPart [1..*]',
      'Sheet->Revision hasRevision [2..2]',
      'Sheet->Status ∋ hasStatus {Current}',
    ]);
  });

  it('restrictions/data-ranges.ttl describes each anonymous range and reads qualified data cardinalities', async () => {
    const r = await load('restrictions/data-ranges.ttl');
    const expr = Object.fromEntries(r.dataProperties.map((d) => [d.name, d.rangeExpression]));
    expect(expr).toMatchObject({
      confidence: 'xsd:decimal [0.0, 1.0]',
      count: 'xsd:integer (0, ∞)',
      code: 'xsd:string pattern "[A-Z]+", maxLength 8',
      either: 'xsd:string ∪ xsd:integer',
      notText: '¬xsd:string',
    });
    const sheet = r.graphData.nodes.find((n) => n.id === 'Sheet');
    expect(sheet?.dataPropertyRestrictions?.find((x) => x.propertyName === 'title')).toMatchObject({ minCardinality: 1, maxCardinality: 1 });
    expect(sheet?.dataPropertyRestrictions?.find((x) => x.propertyName === 'note')).toMatchObject({ minCardinality: 0, maxCardinality: 3 });
  });

  it('class-expressions/nested.ttl gives each nested expression its full formula', async () => {
    const r = await load('class-expressions/nested.ttl');
    const formulas = Object.fromEntries((r.graphData.classExpressions ?? []).map((g) => [g.propertyName, g.formula]));
    expect(formulas).toEqual({
      currentProject: '¬(Agent ∪ OnlineAccount)',
      worksOn: 'Employee ∩ ∃hasBadge.Badge',
      linkedTo: 'A ∪ (B ∪ C)',
      limitedTo: 'A ∩ ∀p.(B ∪ C) ∩ ≥2 q.B',
    });
  });
});
