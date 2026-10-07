/**
 * Read-only notice shown in the Edit-edge modal when the edge was drawn from an anonymous class
 * expression (union / intersection / complement / oneOf) in the property's domain or range. Clicking
 * any relationship that shares the expression surfaces the same note, so the expression is
 * discoverable from the edge. Editing the expression itself is not yet supported — see #59-#62 (and
 * #65 for faithful serialization). Kept out of main.ts.
 */
import type { ClassExpressionGroup } from '../types';
import { OPERATOR_INFO } from './classExpressionModal';

const NOTICE_ID = 'editEdgeClassExpressionNotice';

/** Whether the edge from→to is one the group's expression produced. Object property: a member on the
 * expression's end (`from` for a domain expression, `to` for a range one) and a counterpart on the
 * other. Data property (from = to = the stub's class): that class owns a marked stub — a member for a
 * domain expression, a counterpart (domain class) for a range one. */
function edgeBelongsTo(g: ClassExpressionGroup, from: string, to: string): boolean {
  if (g.propertyKind === 'data') return (g.position === 'domain' ? g.members : g.counterparts).includes(from);
  const [exprEnd, otherEnd] = g.position === 'domain' ? [from, to] : [to, from];
  return g.members.includes(exprEnd) && g.counterparts.includes(otherEnd);
}

/** The class-expression group for the given property that produced the edge from→to, or null.
 * `property` may be a local name or a full URI (edge types can be either). */
export function findClassExpressionGroupForEdge(
  groups: ClassExpressionGroup[] | undefined,
  from: string,
  to: string,
  property: string,
): ClassExpressionGroup | null {
  if (!groups || groups.length === 0) return null;
  return (
    groups.find(
      (g) =>
        edgeBelongsTo(g, from, to) &&
        (g.propertyName === property ||
          g.propertyUri === property ||
          (!!g.propertyUri && (g.propertyUri.endsWith(`#${property}`) || g.propertyUri.endsWith(`/${property}`)))),
    ) ?? null
  );
}

/** What the notice says the expression is. A datatype enumeration lists literal values (no class edge);
 * an object one lists individuals, drawn to their class only when they have one on the graph. */
export function noticeTargetText(group: ClassExpressionGroup): string {
  switch (group.operator) {
    case 'complement':
      return 'the complement of this class (anything that is not it)';
    case 'oneOf':
      if (group.propertyKind === 'data') return 'an enumeration of these literal values';
      return group.members.length > 0
        ? 'an enumeration of these individuals; the edge is drawn to their class'
        : 'an enumeration of these individuals';
    case 'union':
      return 'a union of these classes';
    case 'intersection':
      return 'an intersection of these classes';
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Show (or, when `group` is null, hide) the class-expression notice inside the Edit-edge modal. */
export function showEditEdgeClassExpressionNotice(modal: HTMLElement, group: ClassExpressionGroup | null): void {
  let el = document.getElementById(NOTICE_ID) as HTMLDivElement | null;
  if (!group) {
    if (el) el.style.display = 'none';
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.id = NOTICE_ID;
    el.style.cssText =
      'font-size: 12px; color: #4a2f72; margin: 0 0 10px 0; padding: 8px 10px; background: #f3eefb;' +
      'border: 1px solid #d8c9ef; border-radius: 6px; line-height: 1.45; width: 100%; box-sizing: border-box;' +
      'word-wrap: break-word; overflow-wrap: break-word;';
    const content = modal.querySelector('.modal-content');
    const anchor = content?.querySelector('h3');
    if (anchor && anchor.parentElement === content) {
      anchor.insertAdjacentElement('afterend', el);
    } else if (content) {
      content.insertBefore(el, content.firstChild);
    }
  }
  const info = OPERATOR_INFO[group.operator];
  const chip = (m: string) =>
    `<span style="display:inline-block;background:#efe9f7;border:1px solid #c9b8e6;border-radius:4px;` +
    `padding:1px 7px;margin:1px;font-size:11px;">${escapeHtml(m)}</span>`;
  const glyph = (g: string) => `<span style="font-weight:bold;margin:0 2px;">${g}</span>`;
  const chips =
    group.operator === 'complement'
      ? glyph('¬') + group.members.map(chip).join('')
      : group.operator === 'oneOf'
        ? glyph('{') + (group.values ?? []).map(chip).join(glyph(',')) + glyph('}')
        : group.members.map(chip).join(glyph(info.glyph));
  const where = group.position === 'domain' ? 'domain' : 'range';
  const what = noticeTargetText(group);
  el.innerHTML =
    `<div style="font-weight:600;margin-bottom:4px;">${info.glyph} ${where === 'domain' ? 'Domain' : 'Range'} ${info.word}</div>` +
    `<div style="margin-bottom:5px;">${chips}</div>` +
    (group.nested && group.formula ? `<div style="margin-bottom:5px;">Full expression: <code>${escapeHtml(group.formula)}</code></div>` : '') +
    `<div style="color:#6a5a85;">The ${where} of <b>${escapeHtml(group.propertyName)}</b> is ${what}; ` +
    `the same expression applies to every relationship drawn from it, so this relationship is read-only in ` +
    `the editor for now — adjust the expression in the ontology source.</div>`;
  el.style.display = 'block';
}
