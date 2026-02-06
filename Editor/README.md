# Ontology Editor

Interactive ontology visualizer with TTL file support. Same visualization features as the [Visualizer](../Visualizer/), plus the ability to load any Turtle (.ttl) ontology file.

## Features

- **Load ontology from file** – Open any `.ttl` or `.turtle` ontology from your machine
- **Load last opened ontology** – Quickly reopen the most recently used ontology file
- **Labellable filter** – All / labellable only / non-labellable only
- **Node color by** – Labellable status or default
- **Layout** – Hierarchical (weighted) or force-directed
- **Font size** – Min/max (leaf→root) with hierarchical scaling
- **Search** – Filter by node label or relationship type
- **Relationships** – Show/hide and color by relationship type
- **Editing** – Add/remove nodes and edges, rename nodes, undo/redo

## Testing

```bash
npm run test        # Run tests once
npm run test:watch  # Run tests in watch mode
```

Tests cover load (parse), edit (label update), save (serialize), and round-trip consistency.

## Setup

```bash
cd Editor
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

## Comparison with other ontology editors

| Tool | Pros | Cons |
|------|------|------|
| **This editor** | **Hierarchical view** – clear tree layout for class hierarchies; **simple fast edits** – add/remove nodes and edges, rename, undo/redo; browser-based, no install; direct TTL load/save; lightweight, no server | Limited OWL expressivity; no reasoner; no SPARQL; focused on class hierarchy + relationships |
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
