/**
 * Read-only notice shown in the Edit-edge modal when the edge's domain is part of an anonymous union
 * (owl:unionOf). Clicking either relationship that shares the union surfaces the same note, so the
 * grouping is discoverable from the edge. Editing the union itself is not yet supported — see #59
 * (and #65 for faithful union serialization). Kept out of main.ts.
 */
import type { ClassExpressionGroup } from '../types';

const NOTICE_ID = 'editEdgeUnionNotice';

/** The union group whose domain includes `memberName` for the given property, or null. `property`
 * may be a local name or a full URI (edge types can be either). */
export function findUnionGroupForEdge(
  groups: ClassExpressionGroup[] | undefined,
  memberName: string,
  property: string,
): ClassExpressionGroup | null {
  if (!groups || groups.length === 0) return null;
  return (
    groups.find(
      (g) =>
        g.members.includes(memberName) &&
        (g.propertyName === property ||
          g.propertyUri === property ||
          (!!g.propertyUri && (g.propertyUri.endsWith(`#${property}`) || g.propertyUri.endsWith(`/${property}`)))),
    ) ?? null
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Show (or, when `group` is null, hide) the union notice inside the Edit-edge modal. */
export function showEditEdgeUnionNotice(modal: HTMLElement, group: ClassExpressionGroup | null): void {
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
  const chips = group.members
    .map(
      (m) =>
        `<span style="display:inline-block;background:#efe9f7;border:1px solid #c9b8e6;border-radius:4px;` +
        `padding:1px 7px;margin:1px;font-size:11px;">${escapeHtml(m)}</span>`,
    )
    .join('<span style="font-weight:bold;margin:0 2px;">∪</span>');
  const where = group.position === 'domain' ? 'domain' : 'range';
  el.innerHTML =
    `<div style="font-weight:600;margin-bottom:4px;">∪ Shared ${where} union</div>` +
    `<div style="margin-bottom:5px;">${chips}</div>` +
    `<div style="color:#6a5a85;">The ${where} of <b>${escapeHtml(group.propertyName)}</b> is a union of these classes; ` +
    `the same grouping applies to every relationship drawn from them. Union editing isn't available yet — ` +
    `adjust it in the ontology source.</div>`;
  el.style.display = 'block';
}
