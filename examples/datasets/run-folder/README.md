# A run's folder, with its images

The folder a batch process leaves for one run (issues #226, #227, #228): numbered parts of gzip-compressed N-Quads in two named
graphs, a Turtle file about the run, and an image of each sheet's titleblock. As real runs do, the data names each image by a
path relative to the folder **above** `runs/`: `runs/run-0001/images/sheet-1/titleblock.png`.

| File | What it is |
|---|---|
| `runs/run-0001/part-0001.nq.gz` | Sheets 1 and 2 with their titleblocks (18 triples), in graph `batch/1` |
| `runs/run-0001/part-0002.nq.gz` | Sheet 3 (9 triples), in graph `batch/1` too: the parts are a split by size, not one graph each |
| `runs/run-0001/part-0003.nq.gz` | Sheets 4 and 5 (18 triples), in graph `batch/2` |
| `runs/run-0001/run.ttl` | The run itself, a `prov:Activity` (4 triples), in no named graph |
| `runs/run-0001/images/sheet-N/titleblock.png` | The titleblock of sheets 1, 2, 3 and 5. Sheet 4 has none |
| `runs/run-0001/README.md` | Not data: skipped |

## What to see

1. Open OntoCanvas with no ontology. In the start screen choose **Explore a folder…** and pick `run-folder` or `runs/run-0001`
   (or drop either folder on that box). In Chrome and Edge the browser asks "Let site view files?"; nothing is uploaded.
2. The Individuals tab lists the folder with its four data files: "📁 run-0001 — 4 data files, 4 images", and the status says
   "Added 4 data files from run-0001; 4 images kept for previews; 1 other file skipped." (`run-folder` gives the same, with its
   own README skipped too.) No notice about missing parts: the folder holds them all.
3. 11 individuals: 5 `Sheet`, 5 `Titleblock` and the `Run`. The graphs `batch/1` (27 quads) and `batch/2` (18 quads) are listed.
4. Pick **Titleblock of sheet 2**: its detail shows the image under `imagePath`. Sheet 4's says "No file at this path in the
   folder opened."
5. Hover a drawn titleblock in the graph: its tooltip shows the image too. In the SPARQL tab,
   `SELECT ?tb ?path WHERE { ?tb <http://example.org/examples/run-folder#imagePath> ?path }` shows each image while the pointer is
   over its path.
6. In Chrome and Edge, reload the page: the start screen offers **Reopen run-0001** (the browser asks again first).

Added as files on their own ("From a file…"), the same parts show the path with "Open the data's folder (From a folder…) to see
this image". Opened by address, the paths resolve next to the parts:
[by address](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fdatasets%2Frun-folder%2Fruns%2Frun-0001%2Frun.ttl&data=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fdatasets%2Frun-folder%2Fruns%2Frun-0001%2Fpart-0001.nq.gz&data=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fdatasets%2Frun-folder%2Fruns%2Frun-0001%2Fpart-0002.nq.gz&data=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fdatasets%2Frun-folder%2Fruns%2Frun-0001%2Fpart-0003.nq.gz)
(`run.ttl` as the ontology, the three parts as data).

## Making the files

`node scripts/makeRunFolderExample.mjs` writes the whole folder.
