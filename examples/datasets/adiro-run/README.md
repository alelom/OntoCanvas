# A run that names the ontologies it was made with

A small made-up run of a titleblock inference process, in the shape such runs have (issues #235, #236): one part of
gzip-compressed N-Quads, in one named graph for the whole run. Its `prov:Activity` says which versions of the three
[ADIRO](https://w3id.org/adiro) modules it used (`prov:used`), and its 19 individuals are of classes those modules declare.

| File | What it is |
|---|---|
| `part-0001.nq.gz` | The run: two drawing sheets, each with its file, page, titleblock, bounding box, coordinate frame and three field assertions |
| `part-0001.nq` | The same, uncompressed, to read |

## What to see

1. Open OntoCanvas with no ontology. In the start screen, choose **Explore data files…** and pick `part-0001.nq.gz` (or drop it on that box).
2. The Individuals tab lists 19 individuals by class name only (`FieldAssertion`, `Titleblock`, …). The canvas shows each of their classes as a faded, dashed node with the count of its individuals (no ontology declares them yet), and, as there are few, the individuals around them. With more than 30, only the class nodes are drawn: click a count to draw that class's individuals.
3. Meanwhile the three versions it names are read from w3id on their own (nothing is saved), and a note in the bottom bar says so: "Loaded the ontologies the data was made with: adiro_drawing_metadata 7.0.1, adiro_provenance 2.2.0 and adiro_geometry 3.1.0 (read-only, for the names of its classes; not saved)."
4. The classes are then named by their labels ("Field Assertion", "Titleblock", "Bounding Box"…), and the class nodes become "(defined by: adiro_provenance) / Field Assertion" and so on, with a solid border.
5. Right-click one of those class nodes: **Open external ontology** opens the module.

Alternatively, open `adiro_drawing_metadata` 7.0.1 as the ontology and add this file as data: its imports name most classes already, and the two versions it does not have are read on their own.

## Making the files

`node scripts/makeAdiroRunExample.mjs` writes both files.
