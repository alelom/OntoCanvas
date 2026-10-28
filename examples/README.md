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
| [menu-groups.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fdisplay%2Fmenu-groups.ttl) | The property menus list the ontology's own properties first; imported ones in a collapsed "From other ontologies" group by source; annotations that cannot style a class with only show usages, edit and delete; deprecated ones in "Deprecated", greyed, struck through and never styling a class; those used nowhere in "Not used". Open by URL: it imports [menu-groups-base.ttl](display/menu-groups-base.ttl) from next to it | #137 | [TTL](display/menu-groups.ttl) |
| [example-images.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fdisplay%2Fexample-images.ttl) | A term's example images (ADIRO's `exampleImage`) in its hover tooltip, under the comment: one image, or several rotating every 2 s with `‹ 1/3 ›`; on classes, relationships and data properties; a missing image says so. Open by URL: the images load from the [exampleImage](display/exampleImage) folder next to it | #142 | [TTL](display/example-images.ttl) |
| [image-properties.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fdisplay%2Fimage-properties.ttl) | Images in the hover tooltip from standard properties, read whenever used: `foaf:depiction`, `schema:image` (a URL or an image node with `schema:contentUrl`), and a property declared a subproperty of one of them; several in one carousel. Open by URL: the images load from the [images](display/images) folder next to it | #143 | [TTL](display/image-properties.ttl) |

## Imported terms

| Example (opens in OntoCanvas) | Shows | Issue | Source |
|---|---|---|---|
| [imported-terms.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fimports%2Fimported-terms.ttl) | Terms used from an imported ontology: a restriction edge to an imported class (read-only), a data property listed once, prefixed identifiers | #99–#101 | [TTL](imports/imported-terms.ttl) |
| [fetchable-child.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fimports%2Ffetchable-child.ttl) | An import that can be fetched: it is read from next to the file, and what its parent declares (an object property, two data properties) is listed in the menus as read-only context, never drawn. Needs `fetchable-parent.ttl` beside it | #104 | [TTL](imports/fetchable-child.ttl), [parent](imports/fetchable-parent.ttl) |
| [same-local-name-stub.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fimports%2Fsame-local-name-stub.ttl) | A class with the same local name as an external stub it subclasses (`:Party` and `std:Party`): the ontology opens, its own class keeps the name whatever the declaration order, and the stub is a separate external node with the `subClassOf` line | #164 | [TTL](imports/same-local-name-stub.ttl) |

## Layout

| Example (opens in OntoCanvas) | Shows | Issue | Source |
|---|---|---|---|
| [hierarchy-tiers.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Flayout%2Fhierarchy-tiers.ttl) | With its display config ticking **Tiers** for `subClassOf` and `contains` (Object Properties): *Page element* goes one tier below *Page*, the common container of its subclasses; *Author* and *Format* go below *Page*, which points to them. Untick `contains` to compare; **↶ Restore positions** undoes a layout change; **Layered (ELK)** lays out the same tiers with ELK | #151, #152, #153 | [TTL](layout/hierarchy-tiers.ttl) |
| [broad-menu.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Flayout%2Fbroad-menu.ttl) | A broad, shallow hierarchy like the pizza ontology. *Dish* (17 children), *Vegetable* (8) and *Cheese* (6) show their leaves as a block of several columns, not one row; untick **Stack many leaves under their parent** to compare. *Cheesy dish* and the other classes defined by `owl:equivalentClass` sit one tier below *Dish* or *Ingredient*, not apart | #159, #160 | [TTL](layout/broad-menu.ttl) |

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
| [keeps-source-layout.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fsaving%2Fkeeps-source-layout.ttl) | Saving changes only the lines an edit touches, in a file with class expressions, a class described in two statements, list values, an object list over several lines and a predicate on two lines | #65, #118–#121, #123 | [TTL](saving/keeps-source-layout.ttl) |
| [base-relative-iris.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fsaving%2Fbase-relative-iris.ttl) | Terms written as `<#Term>` under `@base` are saved in place, not appended again | #122 | [TTL](saving/base-relative-iris.ttl) |

## SPARQL queries

| Example (opens in OntoCanvas) | Shows | Issue | Source |
|---|---|---|---|
| [query-panel.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fsparql%2Fquery-panel.ttl) | A small ontology with queries to try in the SPARQL side panel: a property path, a language tag, a blank node, an aggregate, ASK, CONSTRUCT, and a refused update | #171 | [TTL](sparql/query-panel.ttl) |
| [instance-data.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fsparql%2Finstance-data.ttl) | A file of instance data: one class drawn, a bottom-bar warning that the individuals are not drawn, and a SPARQL starting query that lists them | #181 | [TTL](sparql/instance-data.ttl) |

## Term URIs

| Example (opens in OntoCanvas) | Shows | Issue | Source |
|---|---|---|---|
| [version-pinned-uris.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Furis%2Fversion-pinned-uris.ttl) | Right-click → **Copy version-pinned URI (2.1.0)** copies a term URI in the loaded release (`…/2.1.0#Building`), from `owl:versionIRI`; greyed out for `rdfs:subClassOf`; also in embedded mode | #128 | [TTL](uris/version-pinned-uris.ttl) |
| [version-from-version-info.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Furis%2Fversion-from-version-info.ttl) | With only `owl:versionInfo "1.4.0"`, the version-pinned URI is built as `<ontology IRI>/1.4.0#Term`, and its tooltip says so | #128 | [TTL](uris/version-from-version-info.ttl) |

## Versions

| Example (opens in OntoCanvas) | Shows | Issue | Source |
|---|---|---|---|
| [building-2.0.0.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fversions%2Fbuilding-2.0.0.ttl) | The bottom bar shows the version (`v2.0.0`) and a **versions ▾** list of the versions the ontology names (`owl:priorVersion`); choosing one opens it. Also shows a newer release when the ontology IRI or GitHub tags have one | #130, #132, #133 | [TTL](versions/building-2.0.0.ttl) |
| [fetchable-child.ttl](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fimports%2Ffetchable-child.ttl) | **Manage external references** names the version each import declares, and whether the import is pinned to it or follows the latest release | #131 | [TTL](imports/fetchable-child.ttl) |
