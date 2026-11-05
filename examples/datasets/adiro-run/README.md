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
2. The Individuals tab lists 19 individuals by class name only (`FieldAssertion`, `Titleblock`, …), and draws them around faded, dashed stubs: no ontology declares their classes yet.
3. The tab says: "This data names 3 ontologies it was made with: adiro_drawing_metadata 7.0.1, adiro_provenance 2.2.0 and adiro_geometry 3.1.0. Open them?"
4. **Open them**: the three versions are read from w3id (nothing is saved). The classes are then named by their labels ("Field Assertion", "Titleblock", "Bounding Box"…), and the stubs become class nodes "(defined by: adiro_provenance)" and so on, with a solid border.
5. Right-click one of those class nodes: **Open external ontology** opens the module.

Alternatively, open `adiro_drawing_metadata` 7.0.1 as the ontology and add this file as data: its imports name most classes already, and the offer lists the two versions it does not have.

## Making the files

`node scripts/makeAdiroRunExample.mjs` writes both files.
