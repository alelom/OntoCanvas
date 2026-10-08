/**
 * Restriction detail in the Edit-edge modal (#63): what each restriction kind on the edge means (∃ ∀ ∋ ⟲,
 * cardinality), and — for kinds the editor can't write back (anything but ∃ and qualified cardinality) —
 * a read-only lock on the form, so saving can never rewrite e.g. a ∀ restriction as ∃. Kept out of main.ts.
 */
import type { GraphEdge } from '../types';
import { describeRestriction, isEditableRestriction } from '../rdf/restrictions';

const NOTICE_ID = 'editEdgeRestrictionNotice';
/** Form controls locked while a read-only restriction is shown (Cancel stays available). */
const LOCKED_IDS = ['editEdgeType', 'editEdgeFrom', 'editEdgeTo', 'editEdgeMinCard', 'editEdgeMaxCard', 'editEdgeIsRestriction', 'editEdgeConfirm'];

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function setLocked(locked: boolean): void {
  for (const id of LOCKED_IDS) {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLButtonElement | null;
    if (el) el.disabled = locked;
  }
}

/** Show the restriction detail for `edge` (hide it for null or a non-restriction edge), locking the form
 * when the restriction can't be edited safely — or when `forceReadOnly` (an edge drawn from a class
 * expression, #58). Returns whether the form is read-only. */
export function showEditEdgeRestrictionNotice(modal: HTMLElement, edge: GraphEdge | null, propertyLabel: string, forceReadOnly = false): boolean {
  let el = document.getElementById(NOTICE_ID) as HTMLDivElement | null;
  const lines = edge ? describeRestriction(edge, propertyLabel) : [];
  const readOnly = forceReadOnly || (!!edge && !isEditableRestriction(edge));
  setLocked(readOnly);
  if (lines.length === 0) {
    if (el) el.style.display = 'none';
    return readOnly;
  }
  if (!el) {
    el = document.createElement('div');
    el.id = NOTICE_ID;
    el.style.cssText =
      'font-size: 12px; margin: 0 0 10px 0; padding: 8px 10px; border-radius: 6px; line-height: 1.45;' +
      'width: 100%; box-sizing: border-box; word-wrap: break-word; overflow-wrap: break-word;';
    const content = modal.querySelector('.modal-content');
    const anchor = content?.querySelector('h3');
    if (anchor && anchor.parentElement === content) anchor.insertAdjacentElement('afterend', el);
    else if (content) content.insertBefore(el, content.firstChild);
  }
  el.style.color = readOnly ? '#6b4a00' : '#2c3e50';
  el.style.background = readOnly ? '#fff6e0' : '#f2f6fa';
  el.style.border = `1px solid ${readOnly ? '#f0d58c' : '#d5e0ea'}`;
  el.innerHTML =
    `<div style="font-weight:600;margin-bottom:4px;">OWL restriction</div>` +
    lines.map((l) => `<div>${escapeHtml(l)}</div>`).join('') +
    (readOnly
      ? `<div style="margin-top:5px;">Editing or deleting this restriction isn't available yet — adjust it in the ontology source.</div>`
      : '');
  el.style.display = 'block';
  return readOnly;
}
