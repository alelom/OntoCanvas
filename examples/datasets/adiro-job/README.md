# A job of several runs, as a folder tree

A small made-up job of a titleblock inference process, in the shape a batch process leaves it on disk (issue #251): a folder per
run, every run with a `part-0001` of its own, and the merged parts of the runs that finished. Open the `job` folder, not this one.

```
job/runs/run-a/part-0001.nq.gz     run-a, part 1 of 2   (graph urn:example:job:run-a)
job/runs/run-a/part-0002.nq.gz     run-a, part 2 of 2
job/runs/run-b/part-0001.nq.gz     run-b, one part      (graph urn:example:job:run-b)
job/compacted/part-0001.nq.gz      run-a again, merged: the same quads as its two parts
job/images/run-a/crop-1.png        an image: kept for previews, never read as data
job/job_start.json, job_end.json   metadata: skipped
```

Each run's `prov:Activity` names the three [ADIRO](https://w3id.org/adiro) module versions it used, so they are read as read-only
context; each run holds two drawing sheets with their file, page, titleblock, bounding box and two field assertions.

## What to see

1. Open OntoCanvas with no ontology, choose **Explore a folder…** on the start screen and pick `job` (or drop it there).
2. The folder is added as one selection: "Added 4 data files from job; 1 image kept for previews; 2 other files skipped." Each part
   is its own source, named by its path (`runs/run-a/part-0001.nq.gz`, …).
3. No "parts may be missing" notice, though `part-0001.nq.gz` is in three folders: the run folder tells them apart. Remove
   `runs/run-a/part-0002.nq.gz` from a copy and the notice names the gap.
4. The Individuals tab lists the two graphs, "Run run-a — 102 quads" and "Run run-b — 51 quads" (named by the `rdfs:label` of the run's
   activity), each with a checkbox that hides or shows it. run-a counts the quads of its two parts and of the compacted copy: the
   same quads, held twice. The individuals are listed once either way.
5. The individuals (drawings, pages, titleblocks, field assertions) are listed by class, and their classes are on the canvas. With a
   network, the ADIRO modules the runs name are read as well, and name the classes, as for [adiro-run](../adiro-run/).

## Making the files

`node scripts/makeAdiroJobExample.mjs` writes all of them.
