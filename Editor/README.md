# Ontology Editor

Interactive ontology visualizer with TTL file support. Same visualization features as the [Visualizer](../Visualizer/), plus the ability to load any Turtle (.ttl) ontology file.

## Features

- **Load default ontology** – AEC Drawing Ontology (bundled)
- **Select TTL file** – Load any `.ttl` or `.turtle` file from your machine
- **Labellable filter** – All / labellable only / non-labellable only
- **Node color by** – Labellable status or default
- **Layout** – Weighted or force-directed

## Testing

```bash
npm run test        # Run tests once
npm run test:watch  # Run tests in watch mode
```

Tests cover load (parse), edit (label update), save (serialize), and round-trip consistency.
- **Font size** – Min/max (leaf→root) with hierarchical scaling
- **Search** – Filter by node label or relationship type
- **Relationships** – Show/hide and color by relationship type

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

## Tech stack

- **Vite** – Build tool
- **TypeScript** – Type safety
- **N3.js** – Turtle/RDF parsing (client-side)
- **vis-network** – Graph visualization
