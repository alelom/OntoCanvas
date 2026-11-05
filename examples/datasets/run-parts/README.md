# A run in numbered parts

The data of a batch process run as it is often produced: **numbered parts of gzip-compressed N-Quads**, one **named graph per
batch** (issues #221, #222, #223). Open `vocabulary.ttl` as the ontology and add the parts as data. Its header says what you
should see.

| File | What it is |
|---|---|
| `vocabulary.ttl` | The ontology: `Sensor`, `Reading`, `madeBy`, `next`, `value` |
| `part-0001.nq.gz` | Batch 1: three sensors and readings 1 to 15 (81 triples), in graph `batch/1` |
| `part-0002.nq.gz` | Batch 2: readings 16 to 30 (74 triples), in graph `batch/2` |
| `part-0001.nq` | `part-0001.nq.gz` uncompressed, to compare: adding it gives the same individuals |

## Try it

- **By address:** [both parts](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fdatasets%2Frun-parts%2Fvocabulary.ttl&data=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fdatasets%2Frun-parts%2Fpart-0001.nq.gz&data=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fdatasets%2Frun-parts%2Fpart-0002.nq.gz), [part 1 only](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fdatasets%2Frun-parts%2Fvocabulary.ttl&data=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fdatasets%2Frun-parts%2Fpart-0001.nq.gz), [part 2 only](https://alelom.github.io/OntoCanvas/?onto=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fdatasets%2Frun-parts%2Fvocabulary.ttl&data=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fmain%2Fexamples%2Fdatasets%2Frun-parts%2Fpart-0002.nq.gz). The `.gz` files are served as they are, and decompressed in the browser.
- **From disk:** open the vocabulary by its link, then, in the Individuals tab, pick both parts from this folder of your clone with "From a file…", or drop them on the tab or on the graph.

## Making the files

The parts are written by [`scripts/makeRunPartsExample.mjs`](../../../scripts/makeRunPartsExample.mjs):
`node scripts/makeRunPartsExample.mjs`. Two larger parts for trying the size checks are not committed:

- `--large` writes `part-0003.nq.gz` (0.15 MB, about 5.5 MB of data). Adding it asks first, as its estimate (20 times the compressed size) is over 2 MB, then loads.
- `--too-large` writes `part-0004.nq.gz` (0.5 MB, about 18 MB of data). Adding it asks first, then the read stops at 10 MB decompressed and nothing is added.
