# kg-data-processor

## Ontology visualizer

Generate an interactive graph visualization (similar to [WebVOWL](https://service.tib.eu/webvowl/)) with customizable filters:

```bash
uv run python Visualizer/convert_to_html_view.py
```

Then open `Visualizer/visualizer.html` in a browser. Features:

- **Labellable filter**: All / labellable only / non-labellable only
- **Edge type**: Filter by relationship — subClassOf (taxonomy), contains (containment)
- **Node color by**: Labellable status (green/red) or default
- **Layout**: Weighted (roots rise, leaves sink) or force-directed; same-level siblings cluster by parent in weighted mode
- **Spacing**: Slider (50–300) — vertical separation between levels and horizontal spread
- **Reset / Fit**: Zoom controls

## Running tests

```bash
uv run pytest tests/ -v
```

Tests verify the ontology loads correctly, the `labellableRoot` annotation property, and the export script.
