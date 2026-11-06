# A run's folder, with its titleblock crops

The folder a batch process leaves for one run (issues #226, #227, #228, #241): numbered parts of gzip-compressed N-Quads in two
named graphs, a Turtle file about the run, and the crop of each sheet's titleblock.

The crops are kept as ADIRO models them and as real runs write them. The image is an individual of its own, not a value of the
titleblock:

```
Titleblock ─geom:hasBoundingBox→ box ←geom:coversRegion─ frame ←geom:imageOf─ crop (aprov:DrawingFile)
                                                                              aprov:storageLocation "runs/run-0001/images/…_p1.png"
```

Each crop is kept under the path of the drawing it was cut from, `images/<the drawing's path>_p<page>.png`, and
`aprov:storageLocation` names it relative to the folder **above** `runs/`, percent-encoded since drawing paths have spaces, `&`,
`#` and commas: `runs/run-0001/images/Plans%20%26%20Sections/A-101.pdf_p1.png`.

| File | What it is |
|---|---|
| `runs/run-0001/part-0001.nq.gz` | Sheets 1 and 2 with their titleblocks and crops (32 triples), in graph `batch/1` |
| `runs/run-0001/part-0002.nq.gz` | Sheet 3 (16 triples), in graph `batch/1` too: the parts are a split by size, not one graph each |
| `runs/run-0001/part-0003.nq.gz` | Sheets 4 and 5 (32 triples), in graph `batch/2` |
| `runs/run-0001/run.ttl` | The run itself, a `prov:Activity` (4 triples), in no named graph |
| `runs/run-0001/images/Plans & Sections/A-101.pdf_p1.png` | Sheet 1's crop |
| `runs/run-0001/images/Plans & Sections/A-102, rev B.pdf_p1.png` | Sheet 2's crop |
| `runs/run-0001/images/Issue #3/A-103.pdf_p1.png` | Sheet 3's crop |
| `runs/run-0001/images/Elevations/North Wing/A-105.pdf_p1.png` | Sheet 5's crop. Sheet 4 (`Elevations/A-104.pdf`) has none |
| `runs/run-0001/README.md` | Not data: skipped |

## What to see

1. Open OntoCanvas with no ontology. In the start screen choose **Explore a folder…** and pick `run-folder` or `runs/run-0001`
   (or drop either folder on that box). In Chrome and Edge the browser asks "Let site view files?"; nothing is uploaded.
2. The Individuals tab lists the folder with its four data files: "📁 run-0001 — 4 data files, 4 images", and the status says
   "Added 4 data files from run-0001; 4 images kept for previews; 1 other file skipped." (`run-folder` gives the same, with its
   own README skipped too.) No notice about missing parts: the folder holds them all.
3. 26 individuals: 5 of each of `Sheet`, `Titleblock`, `BoundingBox`, `CoordinateFrame` and `DrawingFile`, and the `Run`. The
   graphs `batch/1` (48 quads) and `batch/2` (32 quads) are listed.
4. Pick **Titleblock of sheet 2**: its detail shows the crop under "Images of it (1)", with the crop's individual above it.
   Sheet 4's says "No file at this path in the folder opened."
5. Hover a drawn titleblock in the graph: its tooltip shows the crop too. In the SPARQL tab,
   `SELECT ?crop ?path WHERE { ?crop <https://w3id.org/adiro/adiro_provenance#storageLocation> ?path }` shows each crop while the
   pointer is over its path.
6. In Chrome and Edge, reload the page: the start screen offers **Reopen run-0001** (the browser asks again first).

Added as files on their own ("From a file…"), the same parts show the path with "Open the data's folder (From a folder…) to see
this image". Opened by address, the paths resolve next to the parts:
[by address](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fdatasets%2Frun-folder%2Fruns%2Frun-0001%2Frun.ttl&data=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fdatasets%2Frun-folder%2Fruns%2Frun-0001%2Fpart-0001.nq.gz&data=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fdatasets%2Frun-folder%2Fruns%2Frun-0001%2Fpart-0002.nq.gz&data=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fdatasets%2Frun-folder%2Fruns%2Frun-0001%2Fpart-0003.nq.gz)
(`run.ttl` as the ontology, the three parts as data).

## Making the files

`node scripts/makeRunFolderExample.mjs` writes the whole folder.
