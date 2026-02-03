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
        #searchWrap {{ position: relative; display: inline-block; }}
        #searchAutocomplete {{
            position: absolute; top: 100%; left: 0; right: 0; margin-top: 2px;
            max-height: 200px; overflow-y: auto; background: #fff; border: 1px solid #ccc;
            border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000;
            display: none;
        }}
        #searchAutocomplete.visible {{ display: block; }}
        #searchAutocomplete .suggestion {{ padding: 6px 10px; cursor: pointer; font-size: 13px; border-bottom: 1px solid #eee; }}
        #searchAutocomplete .suggestion:last-child {{ border-bottom: none; }}
        #searchAutocomplete .suggestion:hover, #searchAutocomplete .suggestion.highlight {{ background: #e8f4fc; }}
        #searchAutocomplete .suggestion .hint {{ font-size: 11px; color: #888; margin-left: 6px; }}
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
            <strong>Wrap text:</strong>
            <input type="number" id="wrapChars" min="1" max="50" value="10" style="width: 50px;">
            <span style="font-size: 11px;">chars</span>
        </div>
        <div>
            <strong>Font size:</strong>
            <span style="font-size: 11px;">Min</span>
            <input type="number" id="minFontSize" min="8" max="96" value="20" style="width: 45px;">
            <span style="font-size: 11px;">Max</span>
            <input type="number" id="maxFontSize" min="8" max="96" value="60" style="width: 45px;">
            <span style="font-size: 11px;">px (leaf→root)</span>
        </div>
        <div>
            <strong>Search:</strong>
            <div id="searchWrap">
                <input type="text" id="searchQuery" placeholder="Node or relationship..." autocomplete="off" style="width: 180px; padding: 6px 8px; border-radius: 4px; border: 1px solid #ccc;">
                <div id="searchAutocomplete"></div>
            </div>
            <label style="font-size: 11px; margin-left: 4px;">
                <input type="checkbox" id="searchIncludeNeighbors" checked> Include neighbors
            </label>
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
            nonLabellable: '#b8b8b8',
            unknown: '#95a5a6',
            default: '#3498db'
        }};

        const DEFAULT_EDGE_COLORS = {{
            subClassOf: '#3498db',
            contains: '#27ae60',
            partOf: '#e67e22'
        }};
        const DEFAULT_COLOR = '#95a5a6';
        const SPACING = 220;

        function wrapText(text, maxChars) {{
            if (!text || maxChars <= 0) return text;
            const words = String(text).split(/\\s+/);
            const lines = [];
            let current = '';
            words.forEach(word => {{
                if (current.length === 0) {{
                    current = word;
                }} else if (current.length + 1 + word.length <= maxChars) {{
                    current += ' ' + word;
                }} else {{
                    lines.push(current);
                    current = word;
                }}
            }});
            if (current) lines.push(current);
            return lines.join('\\n');
        }}

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

        function computeNodeDepths(nodeIds, edges) {{
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
                (children[id] || []).filter(c => nodeIds.has(c)).forEach(cid => {{
                    if (!seen.has(cid)) {{
                        seen.add(cid);
                        depth[cid] = (depth[id] || 0) + 1;
                        queue.push(cid);
                    }} else {{
                        depth[cid] = Math.min(depth[cid] ?? 999, (depth[id] || 0) + 1);
                    }}
                }});
            }};
            const unreached = [...nodeIds].filter(id => depth[id] === undefined);
            unreached.forEach(id => {{ depth[id] = 0; }});
            const maxDepth = Math.max(0, ...Object.values(depth));
            return {{ depth, maxDepth }};
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

            const childGap = spacing * 0.15;
            const leafWidth = spacing * 0.4;
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
                    const r = layoutSubtree(c, x, top + spacing);
                    x = r.left + r.width + childGap;
                }});
                const totalW = x - left - childGap;
                const parentX = left + totalW / 2;
                positions[id] = {{ x: parentX, y: top }};
                return {{ left, width: totalW }};
            }};

            let xOffset = 0;
            roots.forEach(root => {{
                const r = layoutSubtree(root, xOffset, 0);
                xOffset = r.left + r.width + spacing * 0.2;
            }});

            return positions;
        }}

        function getSearchSuggestions(query) {{
            if (!query || query.length < 1) return [];
            const q = query.toLowerCase();
            const seen = new Set();
            const suggestions = [];
            const edgeTypes = [...getEdgeTypes()];
            edgeTypes.forEach(type => {{
                if (type.toLowerCase().includes(q) && !seen.has(type)) {{
                    seen.add(type);
                    suggestions.push({{ value: type, label: type, hint: 'relationship' }});
                }}
            }});
            rawData.nodes.forEach(n => {{
                const label = (n.label || '').toLowerCase();
                const id = (n.id || '').toLowerCase();
                if ((label.includes(q) || id.includes(q)) && !seen.has(n.label || n.id)) {{
                    seen.add(n.label || n.id);
                    suggestions.push({{ value: n.label || n.id, label: n.label || n.id, hint: 'node' }});
                }}
            }});
            return suggestions.slice(0, 12);
        }}

        function updateSearchAutocomplete() {{
            const input = document.getElementById('searchQuery');
            const list = document.getElementById('searchAutocomplete');
            const query = (input.value || '').trim();
            const suggestions = getSearchSuggestions(query);
            list.innerHTML = '';
            list.classList.remove('visible');
            list.dataset.highlight = '-1';
            if (suggestions.length === 0) return;
            suggestions.forEach((s, i) => {{
                const div = document.createElement('div');
                div.className = 'suggestion';
                div.dataset.value = s.value;
                div.innerHTML = s.label + '<span class="hint">(' + s.hint + ')</span>';
                div.addEventListener('click', () => {{
                    input.value = s.value;
                    list.classList.remove('visible');
                    applyFilter();
                }});
                list.appendChild(div);
            }});
            list.classList.add('visible');
        }}

        function matchesSearch(node, edge, query) {{
            if (!query || query.trim() === '') return true;
            const q = query.trim().toLowerCase();
            if (node) {{
                const matchLabel = (node.label || '').toLowerCase().includes(q);
                const matchId = (node.id || '').toLowerCase().includes(q);
                if (matchLabel || matchId) return true;
            }}
            if (edge) {{
                if ((edge.type || '').toLowerCase().includes(q)) return true;
            }}
            return false;
        }}

        function buildNetworkData(filter) {{
            const labellableFilter = filter.labellable;
            const searchQuery = (filter.searchQuery || '').trim();
            const includeNeighbors = filter.includeNeighbors !== false;
            let filteredNodes = rawData.nodes.filter(n => {{
                if (labellableFilter === 'all') return true;
                if (labellableFilter === 'true') return n.labellableRoot === true;
                if (labellableFilter === 'false') return n.labellableRoot === false;
                return true;
            }});
            let nodeIds = new Set(filteredNodes.map(n => n.id));
            let filteredEdges = rawData.edges.filter(e => nodeIds.has(e.from) && nodeIds.has(e.to));

            if (searchQuery) {{
                const matchingNodeIds = new Set();
                filteredNodes.forEach(n => {{
                    if (matchesSearch(n, null, searchQuery)) matchingNodeIds.add(n.id);
                }});
                filteredEdges.forEach(e => {{
                    if (matchesSearch(null, e, searchQuery)) {{
                        matchingNodeIds.add(e.from);
                        matchingNodeIds.add(e.to);
                    }}
                }});
                let searchMatchNodeIds = new Set(matchingNodeIds);
                if (includeNeighbors) {{
                    filteredEdges.forEach(e => {{
                        if (matchingNodeIds.has(e.from) || matchingNodeIds.has(e.to)) {{
                            searchMatchNodeIds.add(e.from);
                            searchMatchNodeIds.add(e.to);
                        }}
                    }});
                }}
                filteredNodes = filteredNodes.filter(n => searchMatchNodeIds.has(n.id));
                nodeIds = new Set(filteredNodes.map(n => n.id));
                filteredEdges = rawData.edges.filter(e => nodeIds.has(e.from) && nodeIds.has(e.to));
            }}

            const edgeStyleConfig = filter.edgeStyleConfig || getEdgeStyleConfig();
            filteredEdges = filteredEdges.filter(e => {{
                const style = edgeStyleConfig[e.type];
                return !style || style.show !== false;
            }});

            const layoutMode = filter.layoutMode || 'weighted';
            const wrapChars = filter.wrapChars ?? 10;
            const minFontSize = Math.max(8, Math.min(96, filter.minFontSize ?? 20));
            const maxFontSize = Math.max(minFontSize, Math.min(96, filter.maxFontSize ?? 60));
            const {{ depth, maxDepth }} = computeNodeDepths(nodeIds, filteredEdges);

            let nodePositions = {{}};
            if (layoutMode === 'weighted') {{
                nodePositions = computeWeightedLayout(nodeIds, filteredEdges, SPACING);
            }}

            const nodes = filteredNodes.map(n => {{
                const pos = nodePositions[n.id];
                const d = depth[n.id] ?? 0;
                const fontSize = maxDepth > 0
                    ? Math.round(minFontSize + (maxFontSize - minFontSize) * (maxDepth - d) / maxDepth)
                    : maxFontSize;
                const node = {{
                    id: n.id,
                    label: wrapText(n.label, wrapChars),
                    labellableRoot: n.labellableRoot,
                    color: {{ background: getNodeColor(n, filter.colorBy), border: '#2c3e50' }},
                    font: {{ size: fontSize, color: '#2c3e50' }}
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
        let currentFilter = {{ labellable: 'all', colorBy: 'labellable', wrapChars: 10, minFontSize: 20, maxFontSize: 60, layoutMode: 'weighted', searchQuery: '', includeNeighbors: true }};

        function getNetworkOptions(layoutMode) {{
            const base = {{
                nodes: {{ shape: 'box', margin: 10, font: {{ size: 20, color: '#2c3e50' }} }},
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
                        springLength: SPACING,
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
                        nodeSpacing: SPACING * 0.6,
                        levelSeparation: SPACING * 0.8,
                        treeSpacing: SPACING
                    }}
                }};
            }}
            return base;
        }}

        function applyFilter() {{
            const layoutMode = document.getElementById('layoutMode').value;
            const wrapChars = parseInt(document.getElementById('wrapChars').value, 10) || 10;
            const minFontSize = parseInt(document.getElementById('minFontSize').value, 10) || 20;
            const maxFontSize = parseInt(document.getElementById('maxFontSize').value, 10) || 60;
            const searchEl = document.getElementById('searchQuery');
            const neighborsEl = document.getElementById('searchIncludeNeighbors');
            currentFilter = {{
                labellable: document.querySelector('input[name="labellable"]:checked').value,
                colorBy: document.getElementById('colorBy').value,
                wrapChars: wrapChars,
                minFontSize: minFontSize,
                maxFontSize: maxFontSize,
                searchQuery: searchEl ? searchEl.value : '',
                includeNeighbors: neighborsEl ? neighborsEl.checked : true,
                edgeStyleConfig: getEdgeStyleConfig(),
                layoutMode: layoutMode
            }};
            const data = buildNetworkData(currentFilter);
            const options = getNetworkOptions(layoutMode);
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
        document.getElementById('wrapChars').addEventListener('input', applyFilter);
        document.getElementById('wrapChars').addEventListener('change', applyFilter);
        document.getElementById('minFontSize').addEventListener('input', applyFilter);
        document.getElementById('minFontSize').addEventListener('change', applyFilter);
        document.getElementById('maxFontSize').addEventListener('input', applyFilter);
        document.getElementById('maxFontSize').addEventListener('change', applyFilter);
        (function initSearchAutocomplete() {{
            const input = document.getElementById('searchQuery');
            const list = document.getElementById('searchAutocomplete');
            let debounceTimer;
            input.addEventListener('input', () => {{
                applyFilter();
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(updateSearchAutocomplete, 150);
            }});
            input.addEventListener('focus', () => {{
                if (input.value.trim()) updateSearchAutocomplete();
            }});
            input.addEventListener('keydown', (e) => {{
                const items = list.querySelectorAll('.suggestion');
                let idx = parseInt(list.dataset.highlight || '-1', 10);
                if (e.key === 'ArrowDown') {{
                    e.preventDefault();
                    idx = Math.min(idx + 1, items.length - 1);
                    list.dataset.highlight = idx;
                    items.forEach((el, i) => el.classList.toggle('highlight', i === idx));
                    if (idx >= 0 && items[idx]) items[idx].scrollIntoView({{ block: 'nearest' }});
                }} else if (e.key === 'ArrowUp') {{
                    e.preventDefault();
                    idx = Math.max(idx - 1, -1);
                    list.dataset.highlight = idx;
                    items.forEach((el, i) => el.classList.toggle('highlight', i === idx));
                }} else if (e.key === 'Enter' && idx >= 0 && items[idx]) {{
                    e.preventDefault();
                    input.value = items[idx].dataset.value;
                    list.classList.remove('visible');
                    applyFilter();
                }} else if (e.key === 'Escape') {{
                    list.classList.remove('visible');
                }}
            }});
            document.addEventListener('click', (e) => {{
                if (!input.contains(e.target) && !list.contains(e.target)) {{
                    list.classList.remove('visible');
                }}
            }});
        }})();
        document.getElementById('searchIncludeNeighbors').addEventListener('change', applyFilter);
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
