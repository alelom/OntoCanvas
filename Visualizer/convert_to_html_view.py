#!/usr/bin/env python3
"""Export ontology to JSON for visualization. Generates a self-contained HTML file."""

from pathlib import Path

from rdflib import BNode, Graph, Literal, Namespace, OWL, RDF, RDFS

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
ONTOLOGY_PATH = PROJECT_ROOT / "ontology" / "aec_drawing_ontology.ttl"
OUTPUT_HTML = PROJECT_ROOT / "Visualizer" / "visualizer.html"

NS = Namespace("http://example.org/aec-drawing-ontology#")


def extract_local_name(uri: str) -> str:
    """Get local name from URI (e.g. http://.../#FacadeCladding -> FacadeCladding)."""
    if "#" in uri:
        return uri.split("#")[-1]
    if "/" in uri:
        return uri.split("/")[-1]
    return uri


def load_and_export() -> tuple[list[dict], list[dict]]:
    """Load ontology and extract nodes and edges for visualization."""
    g = Graph()
    # Use file URI for Windows compatibility with rdflib
    with open(ONTOLOGY_PATH, encoding="utf-8") as f:
        g.parse(f, format="turtle")

    nodes: list[dict] = []
    edges: list[dict] = []
    seen_classes: set[str] = set()

    # Get all OWL classes (excluding owl:Thing, etc.)
    for cls in g.subjects(RDF.type, OWL.Class):
        cls_str = str(cls)
        if "aec-drawing-ontology" not in cls_str:
            continue
        local_name = extract_local_name(cls_str)
        if local_name in seen_classes:
            continue
        seen_classes.add(local_name)

        # Get label
        label = str(g.value(cls, RDFS.label) or local_name)

        # Get labellableRoot
        labellable = g.value(cls, NS.labellableRoot)
        labellable_root = None
        if labellable == Literal(True):
            labellable_root = True
        elif labellable == Literal(False):
            labellable_root = False

        nodes.append({
            "id": local_name,
            "label": label,
            "labellableRoot": labellable_root,
        })

    # Get subClassOf edges (direct class -> class, skip anonymous/bnodes)
    for subj, obj in g.subject_objects(RDFS.subClassOf):
        subj_str = str(subj)
        obj_str = str(obj)
        if "aec-drawing-ontology" not in subj_str:
            continue
        subj_name = extract_local_name(subj_str)
        # Direct subClassOf to named class
        if "aec-drawing-ontology" in obj_str and not isinstance(obj, BNode):
            obj_name = extract_local_name(obj_str)
            if subj_name in seen_classes and obj_name in seen_classes:
                edges.append({
                    "from": obj_name,
                    "to": subj_name,
                    "type": "subClassOf",
                })
        # subClassOf to restriction (blank node) - extract partOf, contains, etc.
        elif isinstance(obj, BNode):
            prop = g.value(obj, OWL.onProperty)
            target = g.value(obj, OWL.someValuesFrom)
            if prop is not None and target is not None:
                target_str = str(target)
                if "aec-drawing-ontology" in target_str:
                    target_name = extract_local_name(target_str)
                    prop_name = extract_local_name(str(prop))
                    if subj_name in seen_classes and target_name in seen_classes:
                        if prop_name == "partOf":
                            # partOf: part -> whole (subj partOf target)
                            edges.append({
                                "from": subj_name,
                                "to": target_name,
                                "type": "partOf",
                            })
                            # contains: whole -> part (inverse)
                            edges.append({
                                "from": target_name,
                                "to": subj_name,
                                "type": "contains",
                            })
                        else:
                            edges.append({
                                "from": subj_name,
                                "to": target_name,
                                "type": prop_name,
                            })

    return nodes, edges


def generate_html(nodes: list[dict], edges: list[dict]) -> str:
    """Generate self-contained HTML with embedded data and vis-network."""
    import json
    data_json = json.dumps({"nodes": nodes, "edges": edges})

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AEC Drawing Ontology - Visualizer</title>
    <script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: system-ui, -apple-system, sans-serif; height: 100vh; display: flex; flex-direction: column; }}
        #controls {{
            padding: 12px 16px;
            background: #f5f5f5;
            border-bottom: 1px solid #ddd;
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            align-items: center;
        }}
        #controls label {{ display: flex; align-items: center; gap: 6px; cursor: pointer; }}
        #controls select {{ padding: 6px 10px; border-radius: 4px; border: 1px solid #ccc; }}
        #controls button {{ padding: 6px 12px; border-radius: 4px; border: 1px solid #666; background: #fff; cursor: pointer; }}
        #controls button:hover {{ background: #eee; }}
        #network {{ flex: 1; min-height: 400px; }}
        #info {{ padding: 8px 16px; font-size: 12px; color: #666; background: #fafafa; }}
    </style>
</head>
<body>
    <div id="controls">
        <div>
            <strong>Labellable filter:</strong>
            <label><input type="radio" name="labellable" value="all" checked> All</label>
            <label><input type="radio" name="labellable" value="true"> Labellable only</label>
            <label><input type="radio" name="labellable" value="false"> Non-labellable only</label>
        </div>
        <div>
            <strong>Edge type:</strong>
            <select id="edgeFilter">
                <option value="all">All</option>
                <option value="subClassOf">subClassOf only</option>
                <option value="contains">contains only</option>
                <option value="partOf">partOf only</option>
            </select>
        </div>
        <div>
            <strong>Node color by:</strong>
            <select id="colorBy">
                <option value="labellable">Labellable status</option>
                <option value="default">Default</option>
            </select>
        </div>
        <div>
            <strong>Spacing:</strong>
            <input type="range" id="spacing" min="50" max="300" value="120" step="10">
            <span id="spacingValue">120</span>
        </div>
        <button id="reset">Reset view</button>
        <button id="fit">Fit to screen</button>
    </div>
    <div id="network"></div>
    <div id="info">Nodes: <span id="nodeCount">0</span> | Edges: <span id="edgeCount">0</span></div>

    <script>
        const rawData = {data_json};

        const COLORS = {{
            labellable: '#2ecc71',
            nonLabellable: '#e74c3c',
            unknown: '#95a5a6',
            default: '#3498db'
        }};

        function getNodeColor(node, colorBy) {{
            if (colorBy === 'default') return COLORS.default;
            const lr = node.labellableRoot;
            if (lr === true) return COLORS.labellable;
            if (lr === false) return COLORS.nonLabellable;
            return COLORS.unknown;
        }}

        function computeLevels(nodeIds, edges) {{
            const hierarchyEdges = edges.filter(e =>
                (e.type === 'subClassOf' || e.type === 'contains') && nodeIds.has(e.from) && nodeIds.has(e.to)
            );
            const children = {{}};
            const parents = {{}};
            hierarchyEdges.forEach(e => {{
                (children[e.from] = children[e.from] || []).push(e.to);
                (parents[e.to] = parents[e.to] || []).push(e.from);
            }});
            const levels = {{}};
            const roots = [...nodeIds].filter(id => !parents[id] || parents[id].length === 0);
            roots.forEach(id => levels[id] = 0);
            const seen = new Set(roots);
            const queue = [...roots];
            while (queue.length) {{
                const id = queue.shift();
                (children[id] || []).forEach(cid => {{
                    if (!seen.has(cid)) {{
                        seen.add(cid);
                        levels[cid] = (levels[id] || 0) + 1;
                        queue.push(cid);
                    }}
                }});
            }}
            [...nodeIds].filter(id => levels[id] === undefined).forEach(id => levels[id] = 0);
            return levels;
        }}

        function buildNetworkData(filter) {{
            const labellableFilter = filter.labellable;
            const nodeIds = new Set();
            const filteredNodes = rawData.nodes.filter(n => {{
                if (labellableFilter === 'all') return true;
                if (labellableFilter === 'true') return n.labellableRoot === true;
                if (labellableFilter === 'false') return n.labellableRoot === false;
                return true;
            }});
            filteredNodes.forEach(n => nodeIds.add(n.id));

            const filteredEdges = rawData.edges.filter(e => {{
                if (filter.edgeType !== 'all' && e.type !== filter.edgeType) return false;
                return nodeIds.has(e.from) && nodeIds.has(e.to);
            }});

            const levels = computeLevels(nodeIds, filteredEdges);
            const hierarchyEdges = filteredEdges.filter(e =>
                (e.type === 'subClassOf' || e.type === 'contains') && nodeIds.has(e.from) && nodeIds.has(e.to)
            );
            const parentOf = {{}};
            hierarchyEdges.forEach(e => {{ parentOf[e.to] = e.from; }});

            const levelGroups = {{}};
            [...nodeIds].forEach(id => {{
                const l = levels[id] || 0;
                (levelGroups[l] = levelGroups[l] || []).push(id);
            }});

            const clusterByParent = (levelIds) => {{
                const clusters = {{}};
                levelIds.forEach(id => {{
                    const p = parentOf[id] || '_root';
                    (clusters[p] = clusters[p] || []).push(id);
                }});
                return Object.values(clusters);
            }};

            const spacing = filter.spacing || 120;
            const nodePositions = {{}};
            Object.keys(levelGroups).sort((a,b) => +a - +b).forEach(level => {{
                const levelIds = levelGroups[level];
                const clusters = clusterByParent(levelIds);
                let xOffset = -((clusters.length - 1) * spacing * 0.8) / 2;
                clusters.forEach(cluster => {{
                    cluster.forEach((id, i) => {{
                        const x = xOffset + (i - (cluster.length - 1) / 2) * spacing * 0.5;
                        nodePositions[id] = {{ x, y: level * spacing }};
                    }});
                    xOffset += (cluster.length * spacing * 0.5) + spacing * 0.6;
                }});
            }});

            const nodes = filteredNodes.map(n => {{
                const pos = nodePositions[n.id] || {{ x: 0, y: 0 }};
                return {{
                    id: n.id,
                    label: n.label,
                    labellableRoot: n.labellableRoot,
                    x: pos.x, y: pos.y,
                    color: {{ background: getNodeColor(n, filter.colorBy), border: '#2c3e50' }},
                    font: {{ size: 14 }}
                }};
            }});

            const edges = filteredEdges.map(e => ({{
                from: e.from,
                to: e.to,
                arrows: 'to',
                label: e.type
            }}));

            return {{ nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) }};
        }}

        const container = document.getElementById('network');
        let network = null;
        let currentFilter = {{ labellable: 'all', edgeType: 'all', colorBy: 'labellable', spacing: 120 }};

        function getNetworkOptions(spacing) {{
            return {{
                nodes: {{ shape: 'box', margin: 10 }},
                edges: {{ smooth: {{ type: 'cubicBezier' }}, arrows: 'to' }},
                physics: {{ enabled: false }}
            }};
        }}

        function applyFilter() {{
            const spacing = parseInt(document.getElementById('spacing').value, 10);
            currentFilter = {{
                labellable: document.querySelector('input[name="labellable"]:checked').value,
                edgeType: document.getElementById('edgeFilter').value,
                colorBy: document.getElementById('colorBy').value,
                spacing: spacing
            }};
            const data = buildNetworkData(currentFilter);
            if (network) {{
                network.setData(data);
                network.setOptions(getNetworkOptions(spacing));
            }} else {{
                const options = getNetworkOptions(spacing);
                network = new vis.Network(container, data, options);
                network.on('click', params => {{
                    if (params.nodes.length) {{
                        const nodeId = params.nodes[0];
                        const node = rawData.nodes.find(n => n.id === nodeId);
                        document.getElementById('info').innerHTML =
                            `Selected: ${{node?.label || nodeId}} | Labellable: ${{node?.labellableRoot ?? 'N/A'}}`;
                    }}
                }});
            }}
            document.getElementById('nodeCount').textContent = data.nodes.length;
            document.getElementById('edgeCount').textContent = data.edges.length;
        }}

        document.querySelectorAll('input[name="labellable"]').forEach(r => {{
            r.addEventListener('change', applyFilter);
        }});
        document.getElementById('edgeFilter').addEventListener('change', applyFilter);
        document.getElementById('colorBy').addEventListener('change', applyFilter);
        document.getElementById('spacing').addEventListener('input', function() {{
            document.getElementById('spacingValue').textContent = this.value;
            applyFilter();
        }});
        document.getElementById('reset').addEventListener('click', () => network?.moveTo({{ scale: 1 }}));
        document.getElementById('fit').addEventListener('click', () => network?.fit());

        applyFilter();
    </script>
</body>
</html>'''


def main() -> None:
    """Export ontology and generate visualizer HTML."""
    nodes, edges = load_and_export()
    html = generate_html(nodes, edges)
    OUTPUT_HTML.write_text(html, encoding="utf-8")
    print(f"Generated {OUTPUT_HTML}")
    print(f"  Nodes: {len(nodes)}, Edges: {len(edges)}")
    print("  Open in browser: file://" + str(OUTPUT_HTML.resolve()))


if __name__ == "__main__":
    main()
