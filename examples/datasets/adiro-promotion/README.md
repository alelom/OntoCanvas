# Promoting accepted assertions

ADIRO records each value read off a drawing as a `FieldAssertion` (issue #253): a claim, with its provenance and confidence, that a
field of a subject has a value. A claim is not copied onto the drawing by itself. Once it is **accepted** (`aprov:hasAcceptance
aprov:Accepted`), a rule gives its value to the property its field kind maps to (`aprov:mapsToFieldProperty`), on the subject the
claim is about (`aprov:assertedAbout`), unless a later accepted assertion `aprov:supersedes` it. That rule is `promotion.rq`, the
one of the [ADIRO checks](https://github.com/BuroHappoldMachineLearning/ADIRO) (1.0.0, `queries/uc01/promotion.rq`).

| File | What it is |
|---|---|
| `assertions.nq` | Made-up assertions about one title block and one drawing revision, in the named graph `urn:example:promotion:run-1` |
| `fields.ttl` | An excerpt of `adiro_drawing_metadata` 7.0.1: the field kinds the data uses, and the property each maps to. Open the ontology itself (`https://w3id.org/adiro/adiro_drawing_metadata/7.0.1`) to have all of them |
| `promotion.rq` | The promotion rule of the ADIRO checks |

The assertions, by what the rule makes of them:

| Assertion | About | Says | State | Promoted? |
|---|---|---|---|---|
| a1 | title block | client: Acme Ltd | accepted, but a2 supersedes it | no |
| a2 | title block | client: ACME Limited | accepted, supersedes a1 | **yes**: `assertsClient` |
| a3 | revision | title: Ground Floor Plan | accepted | **yes**: `drawingTitle` |
| a4 | revision | title: Ground Floor Pian | rejected | no |
| a5 | revision | drawing number: A-101 | pending | no |
| a6 | title block | an unrecognised caption | accepted, but its kind (`UnidentifiedField`) maps to no property | no |
| a7 | revision | title: Ground Floor Plan, Rev B | no acceptance recorded (as good as pending) | no |

## What to see

1. Open `fields.ttl` as the ontology (**Open ontology**), then add `assertions.nq` as data (Individuals tab, **From a file…**).
2. In the Query tab, paste `promotion.rq` and run it. It gives two triples: the title block's `assertsClient` ACME Limited, and the
   revision's `drawingTitle` "Ground Floor Plan". A query for the revision's `adm:drawingTitle` has no answer yet: the result was
   only shown.
3. Click **Add result to the data**. The two triples are a source of their own, "Query result", in the graph
   `urn:ontocanvas:result`, listed in the Individuals tab beside the assertions' graph with a checkbox each. The query for the
   revision's title now answers "Ground Floor Plan", and not the rejected or the later unaccepted one.
4. **Remove** the "Query result" source to take it all out again. Nothing was saved or changed in the ontology.

The rule needs the ontology that holds the field kinds: without it nothing is promoted. With real data, the modules the data names
are read as context (with a network), and queries run over them too, so the rule can be run without opening them by hand.

To try it on a whole job, open `examples/datasets/adiro-job/job` as a folder: its assertions are about its title blocks, with an
accepted project number and a pending drawing number on each sheet.

## Making the files

`node scripts/makeAdiroPromotionExample.mjs` writes `assertions.nq`.
