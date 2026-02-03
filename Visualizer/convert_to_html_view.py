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
            <strong>Node color by:</strong>
            <select id="colorBy">
                <option value="labellable">Labellable status</option>
                <option value="default">Default</option>
            </select>
        </div>
        <div>
            <strong>Layout:</strong>
            <select id="layoutMode">
                <option value="weighted">Weighted (leaves sink, roots rise)</option>
                <option value="force">Force-directed</option>
                <option value="hierarchical">Hierarchical</option>
            </select>
        </div>
        <div>
            <strong>Spacing:</strong>
            <input type="range" id="spacing" min="80" max="500" value="220" step="20">
            <span id="spacingValue">220</span>
        </div>
        <details id="edgeStylesMenu" style="margin-left: 8px;">
            <summary style="cursor: pointer; font-weight: bold;">Edge styles</summary>
            <div id="edgeStylesContent" style="margin-top: 8px; padding: 8px; background: #fff; border: 1px solid #ddd; border-radius: 4px; max-height: 200px; overflow-y: auto;"></div>
        </details>
        <button id="reset">Reset view</button>
        <button id="fit">Fit to screen</button>
    </div>
    <div id="network"></div>
    <div id="info">
        Nodes: <span id="nodeCount">0</span> | Edges: <span id="edgeCount">0</span>
        <span style="margin-left: 24px; font-size: 11px;">
            Edge colors: <span style="color: #3498db">●</span> subClassOf
            <span style="color: #27ae60">●</span> contains
            <span style="color: #e67e22">●</span> partOf
        </span>
    </div>

    <script>
        const rawData = {data_json};

        const COLORS = {{
            labellable: '#2ecc71',
            nonLabellable: '#e74c3c',
            unknown: '#95a5a6',
            default: '#3498db'
        }};

        const DEFAULT_EDGE_COLORS = {{
            subClassOf: '#3498db',
            contains: '#27ae60',
            partOf: '#e67e22'
        }};
        const DEFAULT_COLOR = '#95a5a6';

        function getEdgeTypes() {{
            const types = new Set();
            rawData.edges.forEach(e => types.add(e.type));
            return [...types].sort();
        }}

        function initEdgeStylesMenu() {{
            const container = document.getElementById('edgeStylesContent');
            container.innerHTML = '';
            getEdgeTypes().forEach(type => {{
                const color = DEFAULT_EDGE_COLORS[type] || DEFAULT_COLOR;
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px;';
                row.innerHTML = `
                    <label style="display: flex; align-items: center; gap: 4px; font-size: 11px;">
                        <input type="checkbox" class="edge-show-cb" data-type="${{type}}" checked>
                        <span>Show</span>
                    </label>
                    <span style="font-weight: bold; font-size: 14px; min-width: 100px;">${{type}}</span>
                    <label style="display: flex; align-items: center; gap: 4px; font-size: 11px;">
                        <input type="checkbox" class="edge-label-cb" data-type="${{type}}">
                        <span>Label</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 4px;">
                        <span style="font-size: 11px;">Color:</span>
                        <input type="color" class="edge-color-picker" data-type="${{type}}" value="${{color}}" style="width: 28px; height: 22px; padding: 0; border: 1px solid #ccc; cursor: pointer;">
                    </label>
                `;
                container.appendChild(row);
            }});
            container.querySelectorAll('.edge-show-cb, .edge-label-cb, .edge-color-picker').forEach(el => {{
                el.addEventListener('change', applyFilter);
            }});
        }}

        function getEdgeStyleConfig() {{
            const config = {{}};
            getEdgeTypes().forEach(type => {{
                const showCb = document.querySelector('.edge-show-cb[data-type="' + type + '"]');
                const labelCb = document.querySelector('.edge-label-cb[data-type="' + type + '"]');
                const colorEl = document.querySelector('.edge-color-picker[data-type="' + type + '"]');
                config[type] = {{
                    show: showCb ? showCb.checked : true,
                    showLabel: labelCb ? labelCb.checked : false,
                    color: colorEl ? colorEl.value : (DEFAULT_EDGE_COLORS[type] || DEFAULT_COLOR)
                }};
            }});
            return config;
        }}

        function getNodeColor(node, colorBy) {{
            if (colorBy === 'default') return COLORS.default;
            const lr = node.labellableRoot;
            if (lr === true) return COLORS.labellable;
            if (lr === false) return COLORS.nonLabellable;
            return COLORS.unknown;
        }}

        function computeWeightedLayout(nodeIds, edges, spacing) {{
            const hierarchyEdges = edges.filter(e =>
                (e.type === 'subClassOf' || e.type === 'contains') && nodeIds.has(e.from) && nodeIds.has(e.to)
            );
            const children = {{}};
            const parents = {{}};
            const seenPairs = new Set();
            hierarchyEdges.forEach(e => {{
                const key = e.from + '->' + e.to;
                if (seenPairs.has(key)) return;
                const reverseKey = e.to + '->' + e.from;
                if (seenPairs.has(reverseKey)) return;
                seenPairs.add(key);
                (children[e.from] = children[e.from] || []).push(e.to);
                (parents[e.to] = parents[e.to] || []).push(e.from);
            }});
            const roots = [...nodeIds].filter(id => !parents[id] || parents[id].length === 0);
            const depth = {{}};
            roots.forEach(id => depth[id] = 0);
            const queue = [...roots];
            const seen = new Set(roots);
            while (queue.length) {{
                const id = queue.shift();
                (children[id] || []).forEach(cid => {{
                    if (!seen.has(cid)) {{
                        seen.add(cid);
                        depth[cid] = (depth[id] || 0) + 1;
                        queue.push(cid);
                    }} else {{
                        depth[cid] = Math.min(depth[cid] ?? 999, (depth[id] || 0) + 1);
                    }}
                }});
            }}
            const unreached = [...nodeIds].filter(id => depth[id] === undefined);
            unreached.forEach(id => {{ depth[id] = 0; roots.push(id); }});

            const childGap = spacing * 0.12;
            const leafWidth = spacing * 0.3;
            const levelSep = spacing * 0.6;
            const maxParentChildDist = spacing * 0.85;
            const subtreeWidth = (id) => {{
                const ch = (children[id] || []).filter(c => nodeIds.has(c));
                if (ch.length === 0) return leafWidth;
                const totalChildWidth = ch.reduce((sum, c) => sum + subtreeWidth(c), 0);
                return Math.max(leafWidth, totalChildWidth + (ch.length - 1) * childGap);
            }};

            const positions = {{}};
            const layoutSubtree = (id, left, top) => {{
                const ch = (children[id] || []).filter(c => nodeIds.has(c));
                if (ch.length === 0) {{
                    positions[id] = {{ x: left, y: top }};
                    return {{ left, width: leafWidth }};
                }}
                let x = left;
                ch.forEach(c => {{
                    const r = layoutSubtree(c, x, top + levelSep);
                    x = r.left + r.width + childGap;
                }});
                const totalW = x - left - childGap;
                const getBounds = (nid) => {{
                    let minX = positions[nid].x, maxX = positions[nid].x;
                    (children[nid] || []).filter(c => nodeIds.has(c)).forEach(c => {{
                        const b = getBounds(c);
                        minX = Math.min(minX, b.minX);
                        maxX = Math.max(maxX, b.maxX);
                    }});
                    return {{ minX, maxX }};
                }};
                const childXs = ch.map(c => positions[c].x);
                const centroidX = childXs.reduce((a, b) => a + b, 0) / ch.length;
                const maxChildDist = Math.max(...childXs.map(cx => Math.abs(cx - centroidX)));
                if (maxChildDist > maxParentChildDist && ch.length > 1) {{
                    const scale = maxParentChildDist / maxChildDist;
                    const shiftSubtree = (nid, shift) => {{
                        positions[nid].x += shift;
                        (children[nid] || []).filter(c => nodeIds.has(c)).forEach(c => shiftSubtree(c, shift));
                    }};
                    ch.forEach(c => {{
                        const oldX = positions[c].x;
                        const newX = centroidX + (oldX - centroidX) * scale;
                        shiftSubtree(c, newX - oldX);
                    }});
                }}
                const finalCentroid = ch.reduce((sum, c) => sum + positions[c].x, 0) / ch.length;
                positions[id] = {{ x: finalCentroid, y: top }};
                const bounds = getBounds(id);
                return {{ left: bounds.minX, width: bounds.maxX - bounds.minX }};
            }};

            let xOffset = 0;
            roots.forEach(root => {{
                const r = layoutSubtree(root, xOffset, 0);
                xOffset = r.left + r.width + spacing * 0.15;
            }});

            return positions;
        }}

        function resolveOverlaps(positions, nodes, padding) {{
            const getSize = (n) => ({{
                halfW: Math.max(25, (n.label || '').length * 3.5),
                halfH: 14
            }});
            const idToNode = {{}};
            nodes.forEach(n => {{ idToNode[n.id] = n; }});
            const ids = Object.keys(positions);
            const pad = padding || 6;
            for (let iter = 0; iter < 100; iter++) {{
                let moved = false;
                for (let i = 0; i < ids.length; i++) {{
                    for (let j = i + 1; j < ids.length; j++) {{
                        const a = ids[i], b = ids[j];
                        const pa = positions[a], pb = positions[b];
                        const sa = getSize(idToNode[a] || {{ label: '' }});
                        const sb = getSize(idToNode[b] || {{ label: '' }});
                        const dx = pb.x - pa.x;
                        const minDistX = sa.halfW + sb.halfW + pad;
                        const minDistY = sa.halfH + sb.halfH + pad;
                        const distX = Math.abs(dx);
                        const distY = Math.abs(pb.y - pa.y);
                        if (distX < minDistX && distY < minDistY) {{
                            const overlapX = minDistX - distX;
                            const shiftX = (dx >= 0 ? 1 : -1) * overlapX / 2;
                            pa.x -= shiftX;
                            pb.x += shiftX;
                            moved = true;
                        }}
                    }}
                }}
                if (!moved) break;
            }}
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

            const edgeStyleConfig = filter.edgeStyleConfig || getEdgeStyleConfig();
            const filteredEdges = rawData.edges.filter(e => {{
                if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) return false;
                const style = edgeStyleConfig[e.type];
                return !style || style.show !== false;
            }});

            const spacing = filter.spacing || 220;
            const layoutMode = filter.layoutMode || 'weighted';

            let nodePositions = {{}};
            if (layoutMode === 'weighted') {{
                nodePositions = computeWeightedLayout(nodeIds, filteredEdges, spacing);
                resolveOverlaps(nodePositions, filteredNodes, spacing * 0.04);
            }}

            const nodes = filteredNodes.map(n => {{
                const pos = nodePositions[n.id];
                const node = {{
                    id: n.id,
                    label: n.label,
                    labellableRoot: n.labellableRoot,
                    color: {{ background: getNodeColor(n, filter.colorBy), border: '#2c3e50' }},
                    font: {{ size: 14 }}
                }};
                if (pos) {{ node.x = pos.x; node.y = pos.y; }}
                return node;
            }});

            const edges = filteredEdges.map(e => {{
                const style = edgeStyleConfig[e.type] || {{ showLabel: false, color: DEFAULT_COLOR }};
                return {{
                    from: e.from,
                    to: e.to,
                    arrows: 'to',
                    label: style.showLabel ? e.type : '',
                    color: {{ color: style.color, highlight: style.color }}
                }};
            }});

            return {{ nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) }};
        }}

        const container = document.getElementById('network');
        let network = null;
        let currentFilter = {{ labellable: 'all', colorBy: 'labellable', spacing: 220, layoutMode: 'weighted' }};

        function getNetworkOptions(spacing, layoutMode) {{
            const base = {{
                nodes: {{ shape: 'box', margin: 10 }},
                edges: {{ smooth: {{ type: 'cubicBezier' }}, arrows: 'to' }}
            }};
            if (layoutMode === 'weighted') {{
                base.physics = {{ enabled: false }};
            }} else if (layoutMode === 'force') {{
                base.physics = {{
                    enabled: true,
                    barnesHut: {{
                        gravitationalConstant: -2000,
                        centralGravity: 0.3,
                        springLength: spacing,
                        springConstant: 0.04,
                        damping: 0.09,
                        avoidOverlap: 0.1
                    }},
                    stabilization: {{ iterations: 150 }}
                }};
            }} else {{
                base.physics = {{ enabled: false }};
                base.layout = {{
                    hierarchical: {{
                        direction: 'UD',
                        sortMethod: 'directed',
                        nodeSpacing: spacing * 0.6,
                        levelSeparation: spacing * 0.8,
                        treeSpacing: spacing
                    }}
                }};
            }}
            return base;
        }}

        function applyFilter() {{
            const spacing = parseInt(document.getElementById('spacing').value, 10);
            const layoutMode = document.getElementById('layoutMode').value;
            currentFilter = {{
                labellable: document.querySelector('input[name="labellable"]:checked').value,
                colorBy: document.getElementById('colorBy').value,
                spacing: spacing,
                edgeStyleConfig: getEdgeStyleConfig(),
                layoutMode: layoutMode
            }};
            const data = buildNetworkData(currentFilter);
            const options = getNetworkOptions(spacing, layoutMode);
            if (network) {{
                network.setData(data);
                network.setOptions(options);
                if (layoutMode === 'force') {{
                    network.once('stabilizationIterationsDone', () => network.fit());
                }} else if (layoutMode === 'weighted' || layoutMode === 'hierarchical') {{
                    setTimeout(() => network.fit({{ padding: 20 }}), 100);
                }}
            }} else {{
                network = new vis.Network(container, data, options);
                if (layoutMode === 'force') {{
                    network.once('stabilizationIterationsDone', () => network.fit());
                }} else if (layoutMode === 'weighted' || layoutMode === 'hierarchical') {{
                    setTimeout(() => network.fit({{ padding: 20 }}), 100);
                }}
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
        document.getElementById('colorBy').addEventListener('change', applyFilter);
        document.getElementById('layoutMode').addEventListener('change', applyFilter);
        document.getElementById('spacing').addEventListener('input', function() {{
            document.getElementById('spacingValue').textContent = this.value;
            applyFilter();
        }});
        document.getElementById('reset').addEventListener('click', () => network?.moveTo({{ scale: 1 }}));
        document.getElementById('fit').addEventListener('click', () => network?.fit());

        initEdgeStylesMenu();
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
