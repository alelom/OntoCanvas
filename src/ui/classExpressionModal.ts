/**
 * Read-only modal describing an anonymous class expression (e.g. a union domain) when its grouping
 * is clicked on the graph. Kept out of main.ts. Editing the expression is a future enhancement.
 * See issue #59.
 */
import type { ClassExpressionGroup } from '../types';

const OPERATOR_LABEL: Record<ClassExpressionGroup['operator'], { word: string; glyph: string }> = {
  union: { word: 'union', glyph: '∪' },
};

/** Plain-text description of a class-expression group, for the hover tooltip. */
export function describeUnion(group: ClassExpressionGroup): string {
  const op = OPERATOR_LABEL[group.operator] ?? { word: group.operator, glyph: '∘' };
  const joined = group.members.join(` ${op.glyph} `);
  const where = group.position === 'domain' ? 'Domain' : 'Range';
  const second =
    group.propertyKind === 'data'
      ? `The same ${group.propertyName} data property applies to each of these classes.`
      : 'To edit, open "Edit properties" on a connected relationship edge.';
  return `${where} ${op.word}: ${joined}\n${second}`;
}

let overlayEl: HTMLDivElement | null = null;

function ensureOverlay(): HTMLDivElement {
  if (overlayEl) return overlayEl;
  const overlay = document.createElement('div');
  overlay.className = 'class-expr-modal-overlay';
  overlay.style.cssText =
    'position: fixed; inset: 0; z-index: 10001; display: none; align-items: center; justify-content: center;' +
    'background: rgba(0,0,0,0.25);';
  overlay.addEventListener('click', (e) => { if (e.target === overlay) hideClassExpressionModal(); });
  document.body.appendChild(overlay);
  overlayEl = overlay;
  return overlay;
}

export function hideClassExpressionModal(): void {
  if (overlayEl) overlayEl.style.display = 'none';
}

export function showClassExpressionModal(group: ClassExpressionGroup): void {
  const overlay = ensureOverlay();
  const op = OPERATOR_LABEL[group.operator] ?? { word: group.operator, glyph: '∘' };
  const chips = group.members
    .map((m) => `<span style="display:inline-block;background:#efe9f7;border:1px solid #c9b8e6;border-radius:4px;padding:2px 8px;margin:2px;font-size:12px;">${escapeHtml(m)}</span>`)
    .join(`<span style="color:#7a5aa0;font-weight:bold;margin:0 2px;">${op.glyph}</span>`);
  const kind = group.propertyKind === 'object' ? 'object property' : 'datatype property';
  const prop = escapeHtml(group.propertyName);
  const where = group.position === 'domain' ? 'domain' : 'range';
  const membersEsc = group.members.map(escapeHtml);
  // The opposite end of the property: its range when the union is on the domain, and vice versa.
  const counterpartLabel = group.position === 'domain' ? 'Range' : 'Domain';
  const counterpartLine = group.counterpart
    ? `<p style="margin:8px 0 0 0;font-size:12px;color:#444;">${counterpartLabel}: <code>${escapeHtml(group.counterpart)}</code></p>`
    : '';
  // Worked example of what the union means, in plain language. Colons, no em dashes (per request).
  const example =
    group.position === 'domain'
      ? `Example: any individual that has a <b>${prop}</b> property is ${orList(membersEsc)}.`
      : `Example: the value of <b>${prop}</b> is ${orList(membersEsc)}.`;

  overlay.innerHTML = `
    <div class="class-expr-modal" style="background:#fff;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,0.2);
         max-width:420px;width:90%;padding:18px 20px;font-family:inherit;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:15px;color:#2c3e50;">${op.glyph} ${capitalize(op.word)} class expression</h3>
        <button type="button" class="class-expr-modal-close" title="Close"
          style="border:none;background:none;font-size:18px;cursor:pointer;color:#888;line-height:1;">×</button>
      </div>
      <p style="margin:10px 0 2px 0;font-size:12px;color:#666;">
        The <b>${where}</b> of <b>${prop}</b> (${kind}) is the <b>${op.word}</b> of these classes:
      </p>
      <div style="margin-top:6px;">${chips}</div>
      ${counterpartLine}
      <p style="margin:10px 0 0 0;font-size:12px;color:#444;background:#f5f1fb;border-radius:4px;padding:6px 8px;">
        ${example}
      </p>
    </div>`;
  const closeBtn = overlay.querySelector('.class-expr-modal-close') as HTMLButtonElement | null;
  if (closeBtn) closeBtn.addEventListener('click', hideClassExpressionModal);
  overlay.style.display = 'flex';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Human "either a A or a B" / "a A, a B, or a C" phrasing for an exclusive choice of class. */
function orList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `a ${names[0]}`;
  if (names.length === 2) return `either a ${names[0]} or a ${names[1]}`;
  const last = names[names.length - 1];
  return `a ${names.slice(0, -1).join(', a ')}, or a ${last}`;
}
