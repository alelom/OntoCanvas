<div align="center">
  <img src="OntoCanvas.png" alt="OntoCanvas" width="200"/>
  <h1>OntoCanvas</h1>
</div>

Interactive ontology Same with TTL file support.

## Features

- **Nodes and edges styling based on rules**
- **Layout styles** – Hierarchical (weighted) or force-directed
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

**E2E test (delete + undo):** With the dev server running (`npm run dev`), from the project root:

```bash
uv run python tests/test_editor_delete_e2e.py
```

Verifies that deleting a node leaves its children floating and that undo restores correctly. Tests both "with search" and "without search" scenarios. If you see delete/undo bugs in the browser, try a hard refresh (Ctrl+Shift+R) to clear cache.

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
