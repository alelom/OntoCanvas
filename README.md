<div align="center">
  <img src="OntoCanvas.png" alt="OntoCanvas" width="200"/>
  <h1>OntoCanvas</h1>
  
  <!-- The whole unit suite and the whole E2E suite on main, run after each merge by .github/workflows/main-verify.yml -->
  [![Unit tests](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fbadges%2Funit.json)](https://github.com/alelom/OntoCanvas/actions/workflows/main-verify.yml)
  [![E2E tests](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Falelom%2FOntoCanvas%2Fbadges%2Fe2e.json)](https://github.com/alelom/OntoCanvas/actions/workflows/main-verify.yml)
</div>


_**OntoCanvas**_ is an intuitive ontology editor and visualizer that runs directly in your browser.

<img width="1343" height="923" alt="image" src="https://github.com/user-attachments/assets/d0846c70-d06a-4959-8423-4b7d153e03c7" />


## Why use _OntoCanvas_?

Find a [comparison with other editors/viewers below](#comparison-with-other-ontology-editors-and-visualisers). Essentially:
- other editors are less user-friendly (although they can be more powerful)
- other editors require installation on your machine
- other viewers do not offer customisable styling for displaying the ontology,
- other viewers do not allow you to view the ontology with a clear taxonomical view, if present

Therefore, good reasons to use _Ontocanvas_ are: if you want a good hierarchical (taxonomical) view of ontologies, rather than a messy graph; if you want an intuitive, quick, visual way to browse and tweak an ontology (especially class hierarchies and relationships) without installing anything.

> _In this context, an [ontology](https://en.wikipedia.org/wiki/Ontology_(information_science)) is a structured map of meaning, shaped like a graph: it defines the important kinds of things in a domain -- like “Person” and "Name" and "Address" -- and the relationships between them, so people and software share the same understanding. Ontologies are useful as mind maps or for complex tasks involving graph databases or Neural Networks._
> 
> _OntoCanvas helps you design and explore these maps in an intuitive, visual way, so you can discuss and refine how your world is organised without needing to touch code or learn formal ontology logic._ 


## Features
 
- **Layout styles** – Hierarchical (taxonomical/weighted) or force-directed
- **Editing** – Visually add/remove nodes (classes) and edges (object properties) rename classes, add data relationships, Annotation Properties.
- **Nodes and edges styling based on rules**: font size, line colour, rule based, great for presentations.
- **Search** – Filter by node label or relationship type
- **Relationships filters** – Show/hide by relationship type
- **Open:** any RDF format supported by [rdf-parse](https://github.com/rubensworks/rdf-parse.js) — Turtle (`.ttl`, `.turtle`), RDF/XML / OWL (`.owl`, `.rdf`), JSON-LD (`.jsonld`, `.json`), N-Triples, N3, TriG, and more.
- **Save:** Turtle only. When editing a Turtle file, a **minimal-diff, formatting-preserving serializer** rewrites only the lines an edit touches — keeping comments, blank lines, section dividers, property order, typed literals, `rdf:type` notation, and OWL restrictions (including multi-line `rdfs:subClassOf` lists) intact (see [Serialization (saving)](#serialization-saving)).
- **Terms defined elsewhere** – classes that belong to another ontology are shown dimmed, prefixed (e.g. `geo:Geometry`), and are read-only (see [Terms defined elsewhere](#terms-defined-elsewhere)).


## Terms defined elsewhere

Ontologies often reuse terms that are really **defined in another ontology** — for example a class from a standard vocabulary, brought in for alignment and declared locally as a small "stub" (typically with `rdfs:isDefinedBy` pointing at its source, e.g. `geo:Geometry` from GeoSPARQL).

OntoCanvas treats such terms as **belonging elsewhere**, exactly like imported/external references:

- **Dimmed** on the canvas, so they read as "not part of this ontology's own definitions".
- **Prefixed** with the namespace from the Turtle file (e.g. `geo:Geometry` rather than just `Geometry`).
- **Read-only:** their label, comment, annotations and data-property assignments can't be edited here — a ⚠️ marker in the edit dialog explains that the term is defined in another ontology and must be edited there. Hovering the node shows a `(Defined by …)` note followed by the term's comment.

A class counts as *defined elsewhere* when it carries an `rdfs:isDefinedBy` pointing outside this ontology, **or** when its own URI simply lives in a different namespace. Terms in this ontology's own namespace stay fully editable.


## Embedding

OntoCanvas can be embedded in an `<iframe>` (e.g. on an ontology's documentation page) for a compact, **read-only** view. When embedded — automatically inside an iframe, or by adding `?embed=1` to the URL — OntoCanvas:

- hides the top menu and the bottom "Edges" legend for compactness;
- disables all editing (no Add Node/Edge, no edit dialogs, no delete) — the graph can still be **panned (left or right mouse button), zoomed, and its nodes moved**;
- offers a read-only **right-click → "Copy URI"** on classes and relationships (the only context-menu item when embedded). If the embedding page is on a different origin, add `allow="clipboard-write"` to the iframe so the browser permits clipboard access; without it OntoCanvas falls back to a legacy copy method;
- shows an **"Open in a new tab"** button that opens the same ontology in a full, editable OntoCanvas tab.

```html
<iframe src="https://alelom.github.io/OntoCanvas/?onto=<ONTOLOGY_URL>" width="100%" height="600" allow="clipboard-write"></iframe>
```

## Comparison with other ontology editors and visualisers 

| Tool | Pros | Cons |
|------|------|------|
| **OntoCanvas** (this tool) | **Hierarchical view** – clear tree layout for class hierarchies; **simple fast edits** – add/remove nodes and edges, rename, undo/redo; browser-based, no install; **multi-format load** (Turtle, RDF/XML, JSON-LD, etc.), save as Turtle; lightweight, no server | Limited OWL expressivity; no reasoner; no SPARQL; focused on class hierarchy + relationships |
| [**WebVOWL**](https://service.tib.eu/webvowl/) | Web-based visualization; well-established tool; SVG export; good for exploring ontology structure | Primarily visualization only, no editing; **only "free nodes" mode (no hierarchical view)** – makes complex ontologies difficult to understand; only visualisation, no authoring |
| [**Protégé**](https://protege.stanford.edu/) / [**WebProtégé**](https://webprotege.stanford.edu/) | Industry standard; full OWL support; reasoner integration; plugins; collaborative (WebProtégé) | Not very visual; steep learning curve; heavy; form-based, not graph-first |
| [**Onto4ALL**](https://github.com/Piazzi/Onto4ALL) | The most similar alternative, with box-and-arrow visual | currently host server not working; it's not a static page, so it requires a server to be maintained (PHP); fewer features, no custom display options, no display or management of imported ontologies, basic editing, etc.; not widely maintained |
| **[yEd](https://www.yworks.com/products/yed) + manual export** | Generic graph editor; flexible layout; familiar | No ontology semantics; manual translation to TTL; no round-trip |
| [**OWLGrEd**](https://owlgred.lumii.lv/) | UML-style diagrams; good for drawing class diagrams; OWL export | Desktop app; less interactive; diagram-first, not live graph |
| **[VocBench 3](https://vocbench.uniroma2.it/)** | Web-based; strong for SKOS; light OWL; validation | Focused on vocabularies, not full ontology modeling; unintuitive. |
| **metaphactory** | Commercial KG platform; visual ontology modeling; enterprise features | Paid; heavyweight; requires setup |
| **GraphDB Workbench** | Triplestore UI; graph visualisation; SPARQL; query results as graph | Editor is secondary; not designed for ontology authoring |
| **LinkedDataHub** | Low-code RDF/KG; forms + graph views; flexible | Complex setup; more data than schema oriented |
| **TopBraid Composer** | Full OWL; visual + form; SPARQL; Eclipse-based | Commercial; desktop; heavyweight |
| **Semaforer** | Lightweight; web-based; simple | Limited scope; less mature |
| **Neon** | OWL 2; ontology evolution; change tracking | Research tool; less mainstream |






## Tech stack

- **Vite** – Build tool
- **TypeScript** – Type safety
- **rdf-parse** – Multi-format RDF parsing (Turtle, RDF/XML, JSON-LD, etc.) in the browser
- **N3.js** – In-memory RDF store and Turtle serialisation (save)
- **vis-network** – Graph visualization

## Serialization (saving)

**Input can be any RDF format rdf-parse understands; output is always Turtle.** How the Turtle is produced depends on how the file was loaded:

- **Turtle file loaded (`.ttl`)** — *minimal-diff, formatting-preserving save*  
  The app keeps a **source cache** of the original file (block positions, formatting, line endings) and a **custom serializer** rewrites only the lines an edit actually touches. Unedited content stays **byte-for-byte identical**, so saving after an edit produces a clean, reviewable diff. Preserved across edits:
  - indentation, blank lines, line endings, and `#### … ####` **section dividers**;
  - **comments**, **property order**, and **typed literals** (e.g. `"true"^^xsd:boolean` is not rewritten to `true`);
  - **`rdf:type`** notation (not rewritten to `a`);
  - **OWL restrictions** as inline blank nodes, including **multi-line `rdfs:subClassOf` lists** (one item per line) — adding a relationship appends a new item without reflowing the existing ones.

  This holds for renaming a class, adding/changing/removing a comment, adding/deleting a class, adding/editing/removing edges and restrictions, editing object/data properties, toggling annotation properties, and editing example images. The behaviour is pinned by the minimal-diff test suite in `tests/unit/customSerializerTests/`.

- **Other format loaded (RDF/XML, JSON-LD, N-Triples, …) or no source cache**  
  Saving falls back to **standard Turtle serialization** (rdflib). Output is valid Turtle, but the original formatting, comments, and property order are not preserved — the file is effectively converted to a fresh Turtle dump.

So for round-trip editing with minimal diffs, open a `.ttl` file and save again; opening any other format and saving converts it to Turtle.



## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

## Build

```bash
npm run build
```

Output is in `dist/`. Deploy the contents to any static host (e.g. GitHub Pages).

## Testing

```bash
npm run test                        # the whole unit suite
npm run test:affected               # the unit tests for what you changed against origin/main
npm run test:watch                  # unit tests in watch mode
npm run test:e2e:affected           # the E2E tests for what you changed against origin/main
npm run test:e2e:area -- search     # the E2E tests of one or more areas (comma separated)
npm run test:e2e:areas              # list the E2E areas
npm run test:e2e:full               # the whole E2E suite
```

Unit tests cover load (parse), edit (label update), save (serialize) and round-trip consistency. The E2E tests drive the
built app in Chromium (Playwright).

**What runs where**

- **Locally** you run only what your change touches: `test:affected` (the unit tests that import a changed file, chosen with
  Vitest's import graph, plus the few that read files from disk, see [`tests/unitSelect.json`](tests/unitSelect.json)) and
  `test:e2e:affected` (the E2E areas the changed files touch, see below).
- **On a pull request** CI runs the type-check, those same unit tests and those same E2E areas. When they pass, the check
  **Ready to merge** is green, and the pull request can be merged: a ruleset on `main` requires that check for a merge. The
  owner can still push to `main` directly.
- **After the merge** the **whole** unit suite and the **whole** E2E suite run on `main` ([`main-verify.yml`](.github/workflows/main-verify.yml)).
  Green releases and deploys. Red **opens an issue automatically** (label `main-red`) and nothing is released or deployed
  until `main` is fixed. A direct push to `main`, which the owner may do, goes through the same verification.
- **The badges above** are the state of `main` from those two full runs.

The E2E tests are grouped into **areas**, one per feature: [`tests/e2e/areas.json`](tests/e2e/areas.json) lists, for each area, its test
files and the source modules that implement it. A file the map does not place selects every area, so a missing entry costs time and
never skips a test; docs select none. The E2E setup builds the app only when a source is newer than its last build
(`EDITOR_E2E_REBUILD=1` forces a build), so a run of one area starts in seconds.

<!-- e2e-areas:start (generated: node scripts/e2eSelect.mjs --readme) -->
| Area | Covers | Tests |
|---|---|---|
| `loading` | Opening an ontology: from a file, a URL, a folder or the start-up dialog, and the failures. | 8 |
| `saving` | Saving to Turtle, and what the saved file keeps of the original. | 3 |
| `layout` | Layouts, saved positions and the free-standing data property band. | 7 |
| `display-config` | The display config: options, edge styles, and loading one with an ontology. | 4 |
| `data-properties` | Data properties: display on nodes, editing, dragging, owl:Thing and the unattached ones. | 7 |
| `relationships` | Relationships between classes: object properties, restrictions, class expressions, editing and deleting edges. | 12 |
| `nodes` | Classes on the canvas: adding, renaming, deleting, undo, tooltips, labels and the context menu. | 6 |
| `annotations` | Annotation properties: the menu, the modals, their values, and styling nodes by annotation. | 5 |
| `external-refs` | References to other ontologies: the references modal, prefixes, and the external nodes drawn at half opacity. | 5 |
| `imports` | owl:imports: reading imported ontologies, their properties and versions. | 6 |
| `search` | The search box: suggestions, scope and the outline around the matches. | 3 |
| `embed` | The app embedded in an iframe: the compact, read-only view. | 2 |
| `shell` | The bottom bar and what it shows about the selection. | 1 |
| `sparql` | SPARQL queries over the loaded ontology. | 1 |
<!-- e2e-areas:end -->
## Repository hygiene

This is a public repository. A guard fails CI if internal-only names (private infrastructure, feeds, trackers, emails) are committed. Run it locally before pushing:

```bash
npm run check:internal-names
```

Generic, non-identifying patterns are committed in `scripts/ci/internal-names.config.json`; organisation-specific literals are supplied via the `INTERNAL_NAME_PATTERNS` CI secret. See [`scripts/ci/README.md`](scripts/ci/README.md).
