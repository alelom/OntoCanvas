<div align="center">
  <img src="OntoCanvas.png" alt="OntoCanvas" width="200"/>
  <h1>OntoCanvas</h1>
  
  <!-- Test Status Badges (shields.io) -->
  ![Unit Tests](https://img.shields.io/github/actions/workflow/status/alelom/OntoCanvas/test.yml?label=Unit%20Tests&branch=main)
  ![E2E Tests](https://img.shields.io/github/actions/workflow/status/alelom/OntoCanvas/test.yml?label=E2E%20Tests&branch=main)
  
  <!-- Coverage Badges (Codecov) -->
  ![Unit Test Coverage](https://codecov.io/gh/alelom/OntoCanvas/branch/main/graph/badge.svg?flag=unittests&token=)
  ![E2E Test Coverage](https://codecov.io/gh/alelom/OntoCanvas/branch/main/graph/badge.svg?flag=e2e&token=)
</div>

Interactive ontology editor and visualizer with TTL file support.


## Features

 
- **Layout styles** – Hierarchical (weighted) or force-directed
- **Editing** – Visually add/remove nodes (classes) and edges (object properties) rename classes, add data relationships, undo/redo, ...
- **Nodes and edges styling based on rules**: font size, line colour
- **Search** – Filter by node label or relationship type
- **Relationships filters** – Show/hide by relationship type


## Comparison with other ontology editors and visualisers 

| Tool | Pros | Cons |
|------|------|------|
| **OntoCanvas** (this tool) | **Hierarchical view** – clear tree layout for class hierarchies; **simple fast edits** – add/remove nodes and edges, rename, undo/redo; browser-based, no install; direct TTL load/save; lightweight, no server | Limited OWL expressivity; no reasoner; no SPARQL; focused on class hierarchy + relationships |
| **WebVOWL** | Web-based visualization; well-established tool; SVG export; good for exploring ontology structure | Primarily visualization only, no editing; **only "free nodes" mode (no hierarchical view)** – makes complex ontologies difficult to understand; only visualisation, no authoring |
| **Protégé / WebProtégé** | Industry standard; full OWL support; reasoner integration; plugins; collaborative (WebProtégé) | Not very visual; steep learning curve; heavy; form-based, not graph-first |
| **Onto4ALL** | Browser-based; box-and-arrow visual; simple | Limited features; basic editing; not widely maintained |
| **OWLGrEd** | UML-style diagrams; good for drawing class diagrams; OWL export | Desktop app; less interactive; diagram-first, not live graph |
| **VocBench 3** | Web-based; strong for SKOS; light OWL; validation | Focused on vocabularies, not full ontology modeling |
| **metaphactory** | Commercial KG platform; visual ontology modeling; enterprise features | Paid; heavyweight; requires setup |
| **GraphDB Workbench** | Triplestore UI; graph visualisation; SPARQL; query results as graph | Editor is secondary; not designed for ontology authoring |
| **LinkedDataHub** | Low-code RDF/KG; forms + graph views; flexible | Complex setup; more data than schema oriented |
| **yEd + manual export** | Generic graph editor; flexible layout; familiar | No ontology semantics; manual translation to TTL; no round-trip |
| **TopBraid Composer** | Full OWL; visual + form; SPARQL; Eclipse-based | Commercial; desktop; heavyweight |
| **Semaforer** | Lightweight; web-based; simple | Limited scope; less mature |
| **Neon** | OWL 2; ontology evolution; change tracking | Research tool; less mainstream |

**When to use this editor:** You want a quick, visual way to browse and tweak an ontology (especially class hierarchies and relationships) without installing anything, with direct TTL file round-trip and undo/redo.



## Tech stack

- **Vite** – Build tool
- **TypeScript** – Type safety
- **N3.js** – Turtle/RDF parsing (client-side)
- **vis-network** – Graph visualization



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
