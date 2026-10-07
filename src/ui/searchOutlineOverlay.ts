/**
 * Search outline overlay (#84): a pulsing red outline (with a white halo) around what the search matched
 * directly — classes, data-property boxes, and the whole curve of matched relationships.
 *
 * Drawn in a transparent SVG layer above the graph (pointer-events: none), not on the vis canvas, and
 * pulsed by a CSS animation: the animation costs no graph redraws and no per-frame JavaScript. The shapes
 * live in graph coordinates inside one <g> whose transform mirrors the network view; they are refreshed
 * in the network's `afterDrawing` hook, which vis fires on every redraw it does anyway (pan, zoom, drag,
 * re-layout), so the outline moves in lockstep. A pan or zoom only changes the transform; the markup is
 * rebuilt only when the geometry changes. Kept out of main.ts. Geometry: graph/searchOutline.ts.
 */
import type { NodeBox, Point } from '../graph/classExpressionOverlay';
import {
  edgeSamplePoints,
  outlineRect,
  polylinePath,
  polylinesOutsideBoxes,
  viewMatrix,
  type DrawnEdge,
  type OutlineTargets,
} from '../graph/searchOutline';

const SVG_NS = 'http://www.w3.org/2000/svg';
const OVERLAY_ID = 'searchOutlineOverlay';
const STYLE_ID = 'searchOutlineStyle';
/** Gap between a node box and its outline, in graph units. */
const NODE_PAD = 5;
/** Samples along a relationship's curve. */
const EDGE_SAMPLES = 48;

const CSS = `
#${OVERLAY_ID} { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; z-index: 2; }
#${OVERLAY_ID} .oc-outline { fill: none; vector-effect: non-scaling-stroke; stroke-linecap: round; stroke-linejoin: round; }
#${OVERLAY_ID} .oc-halo { stroke: rgba(255, 255, 255, 0.9); stroke-width: 7px; animation: oc-search-halo 1.1s ease-in-out infinite alternate; }
#${OVERLAY_ID} .oc-mark { stroke: #e53935; stroke-width: 3px; animation: oc-search-mark 1.1s ease-in-out infinite alternate; }
@keyframes oc-search-mark { from { stroke-width: 2px; opacity: 0.6; } to { stroke-width: 5px; opacity: 1; } }
@keyframes oc-search-halo { from { stroke-width: 5px; } to { stroke-width: 9px; } }
@media (prefers-reduced-motion: reduce) { #${OVERLAY_ID} .oc-outline { animation: none; } }
`;

/** The parts of a vis Network the overlay reads. */
interface OutlineNet {
  canvasToDOM(p: Point): Point;
  getBoundingBox(id: string): { left: number; top: number; right: number; bottom: number };
  on(event: 'afterDrawing', cb: () => void): void;
  body: {
    nodes: Record<string, unknown>;
    edges: Record<string, DrawnEdge & { labelModule?: { size?: { left: number; top: number; width: number; height: number } } }>;
  };
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function boxOf(net: OutlineNet, id: string | undefined): NodeBox | null {
  if (!id) return null;
  try {
    const b = net.getBoundingBox(id);
    return b && Number.isFinite(b.left) ? { left: b.left, top: b.top, right: b.right, bottom: b.bottom } : null;
  } catch {
    return null;
  }
}

/** Halo + mark pair for one shape (the halo underneath keeps the red readable on any background). */
const pair = (shape: string, attrs: string) =>
  `<${shape} class="oc-outline oc-halo" ${attrs}/><${shape} class="oc-outline oc-mark" ${attrs}/>`;

function rectMarkup(box: NodeBox): string {
  const r = outlineRect(box, NODE_PAD);
  return pair('rect', `x="${+r.x.toFixed(2)}" y="${+r.y.toFixed(2)}" width="${+r.width.toFixed(2)}" height="${+r.height.toFixed(2)}" rx="8"`);
}

/** The relationship's real curve, cut where it runs under any node box (its own ends and any it crosses)
 * and under its own label, so it reads as drawn beneath them like the edge itself. */
function edgeMarkup(net: OutlineNet, id: string, nodeBoxes: NodeBox[]): string {
  const edge = net.body.edges[id];
  if (!edge) return '';
  const points = edgeSamplePoints(edge, EDGE_SAMPLES);
  const boxes = [...nodeBoxes];
  const label = edge.labelModule?.size;
  if (label && Number.isFinite(label.left)) {
    boxes.push({ left: label.left, top: label.top, right: label.left + label.width, bottom: label.top + label.height });
  }
  return polylinesOutsideBoxes(points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), boxes)
    .map((run) => pair('path', `d="${polylinePath(run)}"`))
    .join('');
}

/** Data-property box node ids for a property (plain and restriction boxes, on any class). */
function dataPropertyBoxIds(net: OutlineNet, name: string): string[] {
  const suffix = `__${name}`;
  return Object.keys(net.body.nodes).filter(
    (id) => (id.startsWith('__dataprop__') || id.startsWith('__dataproprestrict__')) && id.endsWith(suffix),
  );
}

/** Attach the search outline to `net` (its container `container`); `getTargets` is read on every redraw. */
export function attachSearchOutline(net: OutlineNet, container: HTMLElement, getTargets: () => OutlineTargets): void {
  ensureStyle();
  let svg = container.querySelector<SVGSVGElement>(`#${OVERLAY_ID}`);
  if (!svg) {
    svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svg.id = OVERLAY_ID;
    svg.appendChild(document.createElementNS(SVG_NS, 'g'));
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.appendChild(svg);
  }
  const group = svg.firstElementChild as SVGGElement;
  let lastMarkup = '';

  net.on('afterDrawing', () => {
    const { nodeIds, dataPropertyNames, edgeIds } = getTargets();
    const boxes = [...nodeIds, ...dataPropertyNames.flatMap((n) => dataPropertyBoxIds(net, n))]
      .map((id) => boxOf(net, id))
      .filter((b): b is NodeBox => !!b);
    // Every node box, for cutting relationship strokes (only computed when a relationship matched).
    const nodeBoxes = edgeIds.length > 0
      ? Object.keys(net.body.nodes).map((id) => boxOf(net, id)).filter((b): b is NodeBox => !!b)
      : [];
    const markup = edgeIds.map((id) => edgeMarkup(net, id, nodeBoxes)).join('') + boxes.map(rectMarkup).join('');
    // Rebuild only when the geometry changed; a pan or zoom just moves the group.
    if (markup !== lastMarkup) {
      group.innerHTML = markup;
      lastMarkup = markup;
    }
    if (markup) group.setAttribute('transform', viewMatrix(net.canvasToDOM({ x: 0, y: 0 }), net.canvasToDOM({ x: 1, y: 0 })));
  });
}
