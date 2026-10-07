# Example ontologies

Small, self-contained ontologies that each demonstrate an OntoCanvas feature. Every file's header comment
says what it shows and what you should see. Open one in OntoCanvas with **Open ontology → Open ontology from
URL**, using the file's raw GitHub URL, or locally with
`http://localhost:5173/?onto=<url-encoded raw URL>` while `npm run dev` is running.

Each example is pinned by a unit test (`tests/unit/*Examples.test.ts`), so its description stays accurate.
New feature PRs add to this collection; see [`.claude/skills/feature-examples`](../.claude/skills/feature-examples/SKILL.md).

## Class expressions

| Example | Shows | Issue |
|---|---|---|
| [union.ttl](class-expressions/union.ttl) | `owl:unionOf` (∪) in domains and ranges, including a domain-only union | #59 |
| [intersection.ttl](class-expressions/intersection.ttl) | `owl:intersectionOf` (∩) | #60 |
| [complement.ttl](class-expressions/complement.ttl) | `owl:complementOf` (¬), including a self-loop case like FOAF `made` | #61 |
| [oneOf.ttl](class-expressions/oneOf.ttl) | `owl:oneOf` enumerations ({}) of individuals and literals | #62 |
| [all-class-expressions.ttl](class-expressions/all-class-expressions.ttl) | All four constructors side by side | #59–#62 |
| [self-loop-restriction.ttl](class-expressions/self-loop-restriction.ttl) | A ∪ / ¬ member that is also a restriction self-loop: corner badge, not a mark on the loop | #86 |
| [nested.ttl](class-expressions/nested.ttl) | Nested expressions and their full formula, e.g. `¬(Agent ∪ OnlineAccount)` | #63 |

## Restrictions and data ranges

| Example | Shows | Issue |
|---|---|---|
| [restriction-kinds.ttl](restrictions/restriction-kinds.ttl) | ∃ ∀ ∋ ⟲ restrictions and cardinalities as edge labels; read-only kinds | #63 |
| [data-ranges.ttl](restrictions/data-ranges.ttl) | Datatype facets, datatype unions/complements, qualified data cardinalities | #63 |
