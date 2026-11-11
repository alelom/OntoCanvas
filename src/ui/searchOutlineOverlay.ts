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
/** An outline's look: its own SVG layer and stylesheet, which styles .oc-halo and .oc-mark under the layer's id. */
export interface OutlineLook {
  overlayId: string;
  css: (overlayId: string) => string;
}
/** Gap between a node box and its outline, in graph units. */
const NODE_PAD = 5;
/** Samples along a relationship's curve. */
const EDGE_SAMPLES = 48;

const LAYER_CSS = (id: string, zIndex: number) => `
#${id} { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; z-index: ${zIndex}; }
#${id} .oc-outline { fill: none; vector-effect: non-scaling-stroke; stroke-linecap: round; stroke-linejoin: round; }`;

/** The search (#84): a pulsing red outline. */
export const SEARCH_LOOK: OutlineLook = {
  overlayId: 'searchOutlineOverlay',
  css: (id) => `${LAYER_CSS(id, 2)}
#${id} .oc-halo { stroke: rgba(255, 255, 255, 0.9); stroke-width: 7px; animation: oc-search-halo 1.1s ease-in-out infinite alternate; }
#${id} .oc-mark { stroke: #e53935; stroke-width: 3px; animation: oc-search-mark 1.1s ease-in-out infinite alternate; }
@keyframes oc-search-mark { from { stroke-width: 2px; opacity: 0.6; } to { stroke-width: 5px; opacity: 1; } }
@keyframes oc-search-halo { from { stroke-width: 5px; } to { stroke-width: 9px; } }
@media (prefers-reduced-motion: reduce) { #${id} .oc-outline { animation: none; } }
`,
};

/** A query result (#207): a pulsing blue outline, under the search's red one, so the two are told apart when both are on. */
export const RESULT_LOOK: OutlineLook = {
  overlayId: 'resultOutlineOverlay',
  css: (id) => `${LAYER_CSS(id, 1)}
#${id} .oc-halo { stroke: rgba(255, 255, 255, 0.9); stroke-width: 7px; animation: oc-result-halo 1.1s ease-in-out infinite alternate; }
#${id} .oc-mark { stroke: #1a73e8; stroke-width: 3px; animation: oc-result-mark 1.1s ease-in-out infinite alternate; }
@keyframes oc-result-mark { from { stroke-width: 2px; opacity: 0.6; } to { stroke-width: 5px; opacity: 1; } }
@keyframes oc-result-halo { from { stroke-width: 5px; } to { stroke-width: 9px; } }
@media (prefers-reduced-motion: reduce) { #${id} .oc-outline { animation: none; } }
`,
};

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

function ensureStyle(look: OutlineLook): void {
  const styleId = `${look.overlayId}Style`;
  if (document.getElementById(styleId)) return;
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = look.css(look.overlayId);
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
  attachOutline(net, container, getTargets, SEARCH_LOOK);
}

/** Attach an outline in `look` to `net` (its container `container`); `getTargets` is read on every redraw. */
export function attachOutline(net: OutlineNet, container: HTMLElement, getTargets: () => OutlineTargets, look: OutlineLook): void {
  ensureStyle(look);
  let svg = container.querySelector<SVGSVGElement>(`#${look.overlayId}`);
  if (!svg) {
    svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svg.id = look.overlayId;
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
