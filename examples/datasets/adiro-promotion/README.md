# Applying a rule that derives values

A small made-up dataset (issue #253): the readings of a drawing's title-block fields, each with a confidence, and a SPARQL
CONSTRUCT that derives the accepted value of each field. The vocabulary is made up (`http://example.org/promotion#`); it is not an
ADIRO rule, only the shape of one: the ontology says which property each field fills, and a query reads the ontology and the data
together.

| File | What it is |
|---|---|
| `fields.ttl` | The ontology: two classes, the properties a field fills (`drawingNumber`, `revision`), and which field fills which (`ex:mapsToProperty`) |
| `readings.nq` | Four readings of two drawings, in the named graph `urn:example:promotion:run-1`: drawing 1's number twice (`A-1O1` at 0.55, `A-101` at 0.91) and its revision, drawing 2's number once |
| `promotion.rq` | The rule: for each field of each drawing, the reading of the highest confidence gives its value to the property the ontology names, and the drawing says which reading it came from |

## What to see

1. Open `fields.ttl` as the ontology (**Open ontology**), then add `readings.nq` as data (Individuals tab, **From a file…**).
2. In the Query tab, paste `promotion.rq` and run it. It gives six triples: `d1 drawingNumber "A-101"`, `d1 revision "P02"`,
   `d2 drawingNumber "B-7"`, and a `promotedFrom` for each reading chosen. The graph outlines the individuals they name.
   A query for `ex:d1 ex:drawingNumber ?v` has no answer yet: the result was only shown.
3. Click **Add result to the data**. The six triples are a source of their own, "Query result", in the graph
   `urn:ontocanvas:result`, listed in the Individuals tab beside the readings' graph with a checkbox each. The `promotedFrom`
   edges are drawn, and the query for `ex:d1 ex:drawingNumber ?v` answers `"A-101"`.
4. **Remove** the "Query result" source to take it all out again. Nothing was saved or changed in the ontology.

Where two readings of a field tie on the highest confidence, both are promoted.
