# Example ontologies

Small, self-contained ontologies that each demonstrate an OntoCanvas feature. Every file's header comment
says what it shows and what you should see. Click an example's name to open it in
[OntoCanvas](https://alelom.github.io/OntoCanvas/); **TTL** links to the file itself. To try one against a local
build, run `npm run dev` and open `http://localhost:5173/?onto=<url-encoded raw URL>`.

Each example is pinned by a unit test (`tests/unit/*Examples.test.ts`), so its description stays accurate.
New feature PRs add to this collection; see [`.claude/skills/feature-examples`](../.claude/skills/feature-examples/SKILL.md).

## Class expressions

| Example (opens in OntoCanvas) | Shows | Issue | Source |
|---|---|---|---|
| [union.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fclass-expressions%2Funion.ttl) | `owl:unionOf` (∪) in domains and ranges, including a domain-only union | #59 | [TTL](class-expressions/union.ttl) |
| [intersection.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fclass-expressions%2Fintersection.ttl) | `owl:intersectionOf` (∩) | #60 | [TTL](class-expressions/intersection.ttl) |
| [complement.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fclass-expressions%2Fcomplement.ttl) | `owl:complementOf` (¬), including a self-loop case like FOAF `made` | #61 | [TTL](class-expressions/complement.ttl) |
| [oneOf.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fclass-expressions%2FoneOf.ttl) | `owl:oneOf` enumerations ({}) of individuals and literals | #62 | [TTL](class-expressions/oneOf.ttl) |
| [all-class-expressions.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fclass-expressions%2Fall-class-expressions.ttl) | All four constructors side by side | #59–#62 | [TTL](class-expressions/all-class-expressions.ttl) |
| [self-loop-restriction.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fclass-expressions%2Fself-loop-restriction.ttl) | A ∪ / ¬ member that is also a restriction self-loop: corner badge, not a mark on the loop | #86 | [TTL](class-expressions/self-loop-restriction.ttl) |
| [read-only-edges.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fclass-expressions%2Fread-only-edges.ttl) | Relationships drawn from a class expression are read-only: locked Edit-edge form, refused delete | #58 | [TTL](class-expressions/read-only-edges.ttl) |
| [nested.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fclass-expressions%2Fnested.ttl) | Nested expressions and their full formula, e.g. `¬(Agent ∪ OnlineAccount)` | #63 | [TTL](class-expressions/nested.ttl) |

## Display

| Example (opens in OntoCanvas) | Shows | Issue | Source |
|---|---|---|---|
| [thing-data-properties.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fdisplay%2Fthing-data-properties.ttl) | Data properties with domain owl:Thing drawn once under owl:Thing; a toggle draws them under every class | #80 | [TTL](display/thing-data-properties.ttl) |
| [imported-note.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fdisplay%2Fimported-note.ttl) | A small "(defined by: <prefix or ontology name>)" line above the label of imported classes and relationships | #111 | [TTL](display/imported-note.ttl) |
| [tooltips.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fdisplay%2Ftooltips.ttl) | One hover tooltip, in one style, for classes, relationship labels and lines | #109 | [TTL](display/tooltips.ttl) |

## Imported terms

| Example (opens in OntoCanvas) | Shows | Issue | Source |
|---|---|---|---|
| [imported-terms.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fimports%2Fimported-terms.ttl) | Terms used from an imported ontology: a restriction edge to an imported class (read-only), a data property listed once, prefixed identifiers | #99–#101 | [TTL](imports/imported-terms.ttl) |
| [fetchable-child.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fimports%2Ffetchable-child.ttl) | An import that can be fetched: it is read from next to the file, and what its parent declares (an object property, two data properties) is listed in the menus as read-only context, never drawn. Needs `fetchable-parent.ttl` beside it | #104 | [TTL](imports/fetchable-child.ttl), [parent](imports/fetchable-parent.ttl) |

## Relationships

| Example (opens in OntoCanvas) | Shows | Issue | Source |
|---|---|---|---|
| [one-edge-type-per-property.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Frelationships%2Fone-edge-type-per-property.ttl) | A property drawn by both a restriction and its domain/range is one relationship type, listed once | #87 | [TTL](relationships/one-edge-type-per-property.ttl) |
| [add-relationship-then-ok.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Frelationships%2Fadd-relationship-then-ok.ttl) | Adding a relationship: type its name and click OK straight away; the edge is added | #98 | [TTL](relationships/add-relationship-then-ok.ttl) |

## Restrictions and data ranges

| Example (opens in OntoCanvas) | Shows | Issue | Source |
|---|---|---|---|
| [restriction-kinds.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Frestrictions%2Frestriction-kinds.ttl) | ∃ ∀ ∋ ⟲ restrictions and cardinalities as edge labels; read-only kinds | #63 | [TTL](restrictions/restriction-kinds.ttl) |
| [data-ranges.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Frestrictions%2Fdata-ranges.ttl) | Datatype facets, datatype unions/complements, qualified data cardinalities | #63 | [TTL](restrictions/data-ranges.ttl) |

## Saving

| Example (opens in OntoCanvas) | Shows | Issue | Source |
|---|---|---|---|
| [data-restriction-cardinality.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fsaving%2Fdata-restriction-cardinality.ttl) | Data-property restrictions are saved in the OWL 2 qualified form; the older unqualified form is still read; an edit changes only its own lines | #75, #108 | [TTL](saving/data-restriction-cardinality.ttl) |
| [undo-delete-class.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fsaving%2Fundo-delete-class.ttl) | Undo after deleting a class restores all of it: comment, annotation, axioms, restrictions, and read-only restrictions pointing to it | #77 | [TTL](saving/undo-delete-class.ttl) |
