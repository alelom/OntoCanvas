<div align="center">
  <img src="OntoCanvas.png" alt="OntoCanvas" width="200"/>
  <h1>OntoCanvas</h1>
  
  <!-- Test Status Badges (shields.io) -->
  ![Unit Tests](https://img.shields.io/github/actions/workflow/status/alelom/OntoCanvas/test.yml?label=Unit%20Tests&branch=main)
  ![E2E Tests](https://img.shields.io/github/actions/workflow/status/alelom/OntoCanvas/test.yml?label=E2E%20Tests&branch=main)
</div>

Interactive ontology editor and visualizer with multi-format RDF support.

## What is OntoCanvas?

OntoCanvas is a visual tool for thinking clearly about complex domains and designing or visualising Ontologies in a intuitive visual way. 

In this context, an ontology is a structured map of meaning, shaped like a graph: it defines the important kinds of things in a domain -- like “Person” and "Name" and "Address" -- and the relationships between them, so people and software share the same understanding. Ontologies are useful as mind maps or for complex tasks involving graph databases or Neural Networks.

OntoCanvas helps you design and explore these maps in an intuitive, visual way, so you can discuss and refine how your world is organised without needing to touch code or learn formal ontology logic. 


## Why use Ontocanvas?

If you want a good hierarchical (taxonomical) view of ontologies, rather than a messy graph; if you want an intuitive, quick, visual way to browse and tweak an ontology (especially class hierarchies and relationships) without installing anything.


## Features
 
- **Layout styles** – Hierarchical (taxonomical/weighted) or force-directed
- **Editing** – Visually add/remove nodes (classes) and edges (object properties) rename classes, add data relationships, Annotation Properties.
- **Nodes and edges styling based on rules**: font size, line colour, rule based, great for presentations.
- **Search** – Filter by node label or relationship type
- **Relationships filters** – Show/hide by relationship type
- **Open:** Turtle (`.ttl`, `.turtle`), RDF/XML / OWL (`.owl`, `.rdf`), JSON-LD (`.jsonld`, `.json`), N-Triples, N3, TriG, and other formats supported by [rdf-parse](https://github.com/rubensworks/rdf-parse.js).
- **Save:** Turtle only. When editing a Turtle file, a **formatting-preserving serializer** keeps comments, blank lines, property order, and OWL restrictions (see [Serialization (saving)](#serialization-saving)).


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

Save output is **Turtle only**. How the Turtle is produced depends on how the file was loaded:

- **Turtle file loaded (`.ttl`)**  
  The app keeps a **source cache** of the original file (block positions, formatting, line endings). On save it uses a **custom serializer** that:
  - Reconstructs the file from the cache and only replaces the blocks or lines that changed (e.g. after a label rename).
  - Preserves **formatting** (indentation, blank lines between blocks, line endings), **comments**, **property order**, and **OWL restrictions** (inline blank nodes).
  - For simple edits (e.g. only a label changes), it does **targeted text replacement** so the rest of the file is unchanged; for blocks with structural changes it re-serializes only those blocks and stitches them back into the cached text.

- **Other format loaded (RDF/XML, JSON-LD, etc.) or no cache**  
  The app falls back to **standard Turtle serialization** (N3/rdflib). Output is valid Turtle but formatting, comments, and property order are not preserved.

So for round-trip editing of Turtle ontologies (minimal diff, preserved structure), open a `.ttl` file and save again; for other formats, saving produces a fresh Turtle dump.



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
