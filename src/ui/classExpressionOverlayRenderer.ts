/**
 * Canvas renderer for anonymous class expressions in a property's domain or range: ∪ union (#59),
 * ∩ intersection (#60), ¬ complement (#61) and {} enumeration (#62). The parser flattens each
 * expression into the classes its edges are drawn against; this draws the mark that keeps the
 * expression visible. Which mark a group gets is decided by `markKind` (pure, unit-tested):
 *
 * - connector (object property, 2+ members): a small dot at ¼ of each member edge's visible part
 *   (outline to outline, arrowhead excluded) from the domain end (¾ for a range expression), joined by thin lines to a central badge. A long connector is "broken"
 *   into short inward arrow-stubs, each with its own small badge, so distant members don't drag long
 *   lines across the graph.
 * - edgeBadge (object property, 1 member — a complement, or an enumeration of one class's
 *   individuals): one badge sitting on the edge at the same ¼ / ¾ point.
 * - nodeBadge (object property, no edge to mark): a corner badge — on each counterpart for an
 *   enumeration of untyped individuals, or on the expression's own classes when the property has no
 *   other end (no range / domain, or owl:Thing).
 * - Missing edges: a member whose edge to the counterpart isn't drawn (a self-loop — FOAF `made`:
 *   domain Agent, range ¬Agent), or is a self-loop drawn for a restriction on the same property (#86),
 *   gets a corner badge on the counterpart instead of an edge mark, rather than a mark at the node's
 *   centre or squeezed under the loop's label. Edges are looked up by property (vis edge id), so a
 *   mark never lands on another property's edge between the same classes.
 *
 * Object-property marks are drawn once per counterpart (the class on the opposite end), so an
 * expression whose other end is itself an expression (e.g. a union domain with an enumeration range)
 * still gets a mark on every edge it produced.
 * - stubBadge (data property): the class→stub edge is too short for an edge mark, so a badge overlaps
 *   a corner of each stub node (domain → top-left, range → top-right); the stub label stays intact.
 *
 * Badges also follow the display font settings (badgeFontScale): led by the font of what they sit on —
 * relationship for edge marks, node for node corners, data property for stub corners — blended with
 * the others, and exactly nominal size at the default settings. Edge badges additionally scale with the edge's visible length (badgeScale),
 * shrinking on short edges and growing a little on long ones. Marks borrow the colour of the
 * relationship they mark. Every mark is a hit-region so hovering
 * explains the expression and clicking opens its modal. Kept out of main.ts.
 */
import type { ClassExpressionGroup } from '../types';
import {
  badgeFraction,
  badgeFontScale,
  ratiosForNodes,
  type BadgeFontRatios,
  type BadgePlacement,
  badgeScale,
  centroid,
  cornerBadgeCenter,
  CornerStacker,
  lerp,
  markKind,
  markLayer,
  nodeBadgeTargets,
  partitionByEdge,
  pointNear,
  pointNearSegment,
  type MarkLayer,
  type Point,
} from '../graph/classExpressionOverlay';
import { OPERATOR_INFO } from './classExpressionModal';
import {
  colorOf,
  visibleEdgeLength,
  dataStubId,
  drawArrowhead,
  drawBadge,
  edgePoint,
  findDataPropertyEdge,
  findPropertyEdge,
  nodeBox,
  nodePos,
  type OverlayNet,
} from './classExpressionCanvas';

export type { OverlayNet } from './classExpressionCanvas';

const FALLBACK_COLOR = 'rgba(120, 90, 160, 0.95)';
const DATA_FALLBACK_COLOR = '#4a90a4'; // data-property edge teal, when the edge colour can't be read
const HUB_RADIUS = 13;
const DOT_RADIUS = 4;
const SEGMENT_HIT_TOLERANCE = 6;
/** Beyond this connector length, break the line into a short inward arrow-stub to de-clutter. */
const BREAK_THRESHOLD = 240;
const STUB_LEN = 66;
const ARROW_SIZE = 9;
/** Central badge (whole connector, single-edge badge) vs. the small badges (broken connector, corners). */
const HUB_GLYPH_SIZE = 20;
const SMALL_BADGE_RADIUS = 10;
const SMALL_GLYPH_SIZE = 16;

interface Region { group: ClassExpressionGroup; center: Point; radius: number; segments: Array<[Point, Point]> }

const ALL_LAYERS: MarkLayer[] = ['edges', 'nodes'];
const DEFAULT_FONT_RATIOS: BadgeFontRatios = { node: 1, relationship: 1, dataProperty: 1 };

export interface ClassExpressionOverlay {
  /** Draw the marks of the given layers (default: all) in canvas coords. `edges` marks belong between
   * the edge lines and labels, `nodes` marks on top (see visEdgeLayering / markLayer). */
  draw(
    net: OverlayNet,
    ctx: CanvasRenderingContext2D,
    groups: ClassExpressionGroup[],
    layers?: MarkLayer[],
    fontRatios?: BadgeFontRatios,
  ): void;
  /** The group whose mark / connector is under a canvas-space point, or null. */
  groupAt(point: Point): ClassExpressionGroup | null;
}

/** The point on each member edge where the expression is "tapped", the colour of those edges, and the
 * badge scale for them: set by the SHORTEST member edge's visible length, so the badge fits it. */
function memberEdgePoints(
  net: OverlayNet,
  ctx: CanvasRenderingContext2D,
  group: ClassExpressionGroup,
  counterpartId: string,
  members: string[],
): { points: Point[]; color: string | null; scale: number } {
  const t = badgeFraction(group.position);
  const points: Point[] = [];
  const lengths: number[] = [];
  let color: string | null = null;
  const cpPos = nodePos(net, counterpartId);
  if (!cpPos) return { points, color, scale: 1 };
  for (const member of members) {
    const memberPos = nodePos(net, member);
    if (!memberPos) continue;
    const edge = propertyEdge(net, group, member, counterpartId);
    color = color ?? colorOf(edge);
    // The edge runs domain→range; `domainNode` is whichever end isn't the expression side.
    const domainNode = group.position === 'domain' ? member : counterpartId;
    const [domainPos, rangePos] = group.position === 'domain' ? [memberPos, cpPos] : [cpPos, memberPos];
    // Sample on the real edge curve; fall back to a straight chord (domain→range) if unavailable.
    points.push(edgePoint(edge, domainNode, t, ctx) ?? lerp(domainPos, rangePos, t));
    const length = visibleEdgeLength(edge, ctx);
    if (length != null) lengths.push(length);
  }
  return { points, color, scale: badgeScale(lengths.length > 0 ? Math.min(...lengths) : null) };
}

/** The drawn edge of the group's property between a member and a counterpart (domain → range), or null. */
function propertyEdge(net: OverlayNet, group: ClassExpressionGroup, member: string, counterpartId: string) {
  const [from, to] = group.position === 'domain' ? [member, counterpartId] : [counterpartId, member];
  return findPropertyEdge(net, from, to, group.propertyName, group.propertyUri);
}

export function createClassExpressionOverlay(): ClassExpressionOverlay {
  // Hit regions per layer; each layer's are rebuilt when that layer is drawn. `regions` is the list
  // the draw helpers append to (the layer currently being drawn).
  const regionsByLayer: Record<MarkLayer, Region[]> = { edges: [], nodes: [] };
  let regions: Region[] = regionsByLayer.edges;
  // Display font settings (relative to their defaults) for the frame being drawn: badges follow them.
  let ratios: BadgeFontRatios = DEFAULT_FONT_RATIOS;

  function drawConnector(
    net: OverlayNet,
    ctx: CanvasRenderingContext2D,
    group: ClassExpressionGroup,
    glyph: string,
    counterpartId: string,
    members: string[],
  ): void {
    const { points: dots, color, scale: lengthScale } = memberEdgePoints(net, ctx, group, counterpartId, members);
    const scale = lengthScale * badgeFontScale('edge', ratiosForNodes(ratios, [counterpartId, ...members]));
    if (dots.length < 2) return;
    const stroke = color ?? FALLBACK_COLOR;
    const hub = centroid(dots);
    const segments: Array<[Point, Point]> = [];
    // Any over-long connector "breaks" the whole group: the continuous line + central badge give way to
    // short arrows (one per member) pointing inward, each carrying its own small badge.
    const broken = dots.some((d) => Math.hypot(hub.x - d.x, hub.y - d.y) > BREAK_THRESHOLD);
    for (const d of dots) {
      const len = Math.hypot(hub.x - d.x, hub.y - d.y);
      // Reset stroke each iteration — drawBadge()/drawArrowhead() mutate stroke + fill state.
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = stroke;
      const end = broken ? lerp(d, hub, Math.min(1, STUB_LEN / len)) : hub;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      if (broken) {
        drawArrowhead(ctx, end, d, ARROW_SIZE * scale, stroke);
        drawBadge(ctx, lerp(d, end, 0.5), SMALL_BADGE_RADIUS * scale, SMALL_GLYPH_SIZE * scale, stroke, glyph);
      }
      segments.push([d, end]);
    }
    // A dot where each edge is "tapped".
    ctx.fillStyle = stroke;
    for (const d of dots) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, DOT_RADIUS * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!broken) drawBadge(ctx, hub, HUB_RADIUS * scale, HUB_GLYPH_SIZE * scale, stroke, glyph);
    regions.push({ group, center: hub, radius: broken ? 0 : HUB_RADIUS * scale, segments });
  }

  function drawEdgeBadge(
    net: OverlayNet,
    ctx: CanvasRenderingContext2D,
    group: ClassExpressionGroup,
    glyph: string,
    counterpartId: string,
    members: string[],
  ): void {
    const { points, color, scale: lengthScale } = memberEdgePoints(net, ctx, group, counterpartId, members);
    const scale = lengthScale * badgeFontScale('edge', ratiosForNodes(ratios, [counterpartId, ...members]));
    const at = points[0];
    if (!at) return;
    drawBadge(ctx, at, HUB_RADIUS * scale, HUB_GLYPH_SIZE * scale, color ?? FALLBACK_COLOR, glyph);
    regions.push({ group, center: at, radius: HUB_RADIUS * scale, segments: [] });
  }

  function drawCornerBadge(
    net: OverlayNet,
    ctx: CanvasRenderingContext2D,
    group: ClassExpressionGroup,
    glyph: string,
    nodeId: string,
    color: string,
    stacker: CornerStacker,
    placement: BadgePlacement,
    fontNode: string,
  ): void {
    const box = nodeBox(net, nodeId);
    if (!box) return;
    const s = badgeFontScale(placement, ratiosForNodes(ratios, [fontNode]));
    const radius = SMALL_BADGE_RADIUS * s;
    const at = cornerBadgeCenter(box, group.position, stacker.next(nodeId, group.position), radius);
    drawBadge(ctx, at, radius, SMALL_GLYPH_SIZE * s, color, glyph);
    regions.push({ group, center: at, radius, segments: [] });
  }

  function draw(
    net: OverlayNet,
    ctx: CanvasRenderingContext2D,
    groups: ClassExpressionGroup[],
    layers = ALL_LAYERS,
    fontRatios = DEFAULT_FONT_RATIOS,
  ): void {
    ratios = fontRatios;
    for (const layer of layers) regionsByLayer[layer] = [];
    if (!groups || groups.length === 0) return;
    const stacker = new CornerStacker();
    ctx.save();
    ctx.setLineDash([]);
    for (const group of groups) {
      const kind = markKind(group);
      if (!kind) continue;
      const glyph = OPERATOR_INFO[group.operator].glyph;
      if (kind === 'connector' || kind === 'edgeBadge') {
        // Per counterpart: members with a drawn edge get the edge mark (connector for 2+, else one badge);
        // any member without one (a self-loop) puts a corner badge on the counterpart, in the top layer.
        for (const cp of group.counterparts) {
          const { withEdge, withoutEdge } = partitionByEdge(group.members, cp, (m, c) => propertyEdge(net, group, m, c) !== null);
          if (layers.includes('edges') && withEdge.length > 0) {
            regions = regionsByLayer.edges;
            if (withEdge.length >= 2) drawConnector(net, ctx, group, glyph, cp, withEdge);
            else drawEdgeBadge(net, ctx, group, glyph, cp, withEdge);
          }
          if (layers.includes('nodes') && withoutEdge.length > 0) {
            regions = regionsByLayer.nodes;
            drawCornerBadge(net, ctx, group, glyph, cp, FALLBACK_COLOR, stacker, 'node', cp);
          }
        }
        continue;
      }
      if (!layers.includes(markLayer(kind))) continue;
      regions = regionsByLayer[markLayer(kind)];
      switch (kind) {
        case 'nodeBadge':
          for (const nodeId of nodeBadgeTargets(group)) {
            drawCornerBadge(net, ctx, group, glyph, nodeId, FALLBACK_COLOR, stacker, 'node', nodeId);
          }
          break;
        case 'stubBadge':
          // A range expression marks the stubs of the property's domain classes (its counterparts).
          for (const classId of group.position === 'domain' ? group.members : group.counterparts) {
            const stubId = dataStubId(net, classId, group.propertyName);
            if (!stubId) continue;
            const color = colorOf(findDataPropertyEdge(net, classId, stubId)) ?? DATA_FALLBACK_COLOR;
            drawCornerBadge(net, ctx, group, glyph, stubId, color, stacker, 'dataProperty', classId);
          }
          break;
      }
    }
    ctx.restore();
  }

  function groupAt(point: Point): ClassExpressionGroup | null {
    // Topmost first: node corner badges are drawn over the edge marks.
    const all = [...regionsByLayer.edges, ...regionsByLayer.nodes];
    for (let i = all.length - 1; i >= 0; i--) {
      const r = all[i];
      if (pointNear(point, r.center, r.radius)) return r.group;
      if (r.segments.some(([a, b]) => pointNearSegment(point, a, b, SEGMENT_HIT_TOLERANCE))) return r.group;
    }
    return null;
  }

  return { draw, groupAt };
}
