<div align="center">
  <img src="OntoCanvas.png" alt="OntoCanvas" width="200"/>
  <h1>OntoCanvas</h1>
  
  <!-- Test Status Badges (shields.io) -->
  ![Unit Tests](https://img.shields.io/github/actions/workflow/status/alelom/OntoCanvas/test.yml?label=Unit%20Tests&branch=main)
  ![E2E Tests](https://img.shields.io/github/actions/workflow/status/alelom/OntoCanvas/test.yml?label=E2E%20Tests&branch=main)
</div>


_**OntoCanvas**_ is an intuitive ontology editor and visualizer that runs directly in your browser.

<img width="1343" height="923" alt="image" src="https://github.com/user-attachments/assets/503a2aa8-885f-43f9-bc2b-9ddda0847ea6" />




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
npm run test        # Run tests once
npm run test:watch  # Run tests in watch mode
```

Tests cover load (parse), edit (label update), save (serialize), and round-trip consistency with E2E tests.
