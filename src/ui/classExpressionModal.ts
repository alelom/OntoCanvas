/**
 * Read-only modal describing an anonymous class expression (union / intersection / complement /
 * enumeration in a property's domain or range) when its mark is clicked on the graph, plus the plain
 * text used for its hover tooltip. Kept out of main.ts. Editing the expression is a future
 * enhancement. See issues #59 (union), #60 (intersection), #61 (complement) and #62 (oneOf).
 */
import type { ClassExpressionGroup, ClassExpressionOperator } from '../types';

/** Display info per constructor: the glyph drawn on the graph, the word used in text, and the title. */
export const OPERATOR_INFO: Record<ClassExpressionOperator, { word: string; glyph: string; title: string }> = {
  union: { word: 'union', glyph: '∪', title: 'Union class expression' },
  intersection: { word: 'intersection', glyph: '∩', title: 'Intersection class expression' },
  complement: { word: 'complement', glyph: '¬', title: 'Complement class expression' },
  oneOf: { word: 'enumeration', glyph: '{}', title: 'Enumeration (owl:oneOf)' },
};

/** The expression in symbolic form: "A ∪ B", "A ∩ B", "¬A", "{a, b}". */
function formula(group: ClassExpressionGroup): string {
  switch (group.operator) {
    case 'complement':
      return `¬${group.members[0] ?? '?'}`;
    case 'oneOf':
      return `{${(group.values ?? []).join(', ')}}`;
    default:
      return group.members.join(` ${OPERATOR_INFO[group.operator].glyph} `);
  }
}

/** Plain-text description of a class-expression group, for the hover tooltip. */
export function describeClassExpression(group: ClassExpressionGroup): string {
  const where = group.position === 'domain' ? 'Domain' : 'Range';
  const second =
    group.propertyKind === 'data'
      ? `Applies to the ${group.propertyName} data property shown on each marked class.`
      : 'To edit, open "Edit properties" on a connected relationship edge.';
  return `${where} ${OPERATOR_INFO[group.operator].word}: ${formula(group)}\n${second}`;
}

/** The plain-language example sentence shown in the modal (HTML; names escaped). */
export function expressionExample(group: ClassExpressionGroup): string {
  const prop = escapeHtml(group.propertyName);
  const members = group.members.map(escapeHtml);
  const subject =
    group.position === 'domain' ? `any individual that has a <b>${prop}</b> property is` : `the value of <b>${prop}</b> is`;
  switch (group.operator) {
    case 'union':
      return `${subject} ${orList(members)}.`;
    case 'intersection':
      return `${subject} ${andList(members)}.`;
    case 'complement':
      return `${subject} anything that is not a ${members[0] ?? '?'}.`;
    case 'oneOf':
      return `${subject} exactly one of: ${(group.values ?? []).map(escapeHtml).join(', ')}.`;
  }
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

const chip = (text: string) =>
  `<span style="display:inline-block;background:#efe9f7;border:1px solid #c9b8e6;border-radius:4px;padding:2px 8px;margin:2px;font-size:12px;">${escapeHtml(text)}</span>`;
const sep = (glyph: string) => `<span style="color:#7a5aa0;font-weight:bold;margin:0 2px;">${glyph}</span>`;

/** The expression's operands as chips joined by its glyph (braces around an enumeration). */
function chipsHtml(group: ClassExpressionGroup): string {
  const info = OPERATOR_INFO[group.operator];
  switch (group.operator) {
    case 'complement':
      return `${sep('¬')}${chip(group.members[0] ?? '?')}`;
    case 'oneOf':
      return `${sep('{')}${(group.values ?? []).map(chip).join(sep(','))}${sep('}')}`;
    default:
      return group.members.map(chip).join(sep(info.glyph));
  }
}

/** The intro sentence above the chips. */
function introHtml(group: ClassExpressionGroup): string {
  const kind = group.propertyKind === 'object' ? 'object property' : 'datatype property';
  const head = `The <b>${group.position}</b> of <b>${escapeHtml(group.propertyName)}</b> (${kind}) is`;
  switch (group.operator) {
    case 'complement':
      return `${head} the <b>complement</b> of this class (everything that is <i>not</i> it):`;
    case 'oneOf':
      return `${head} an <b>enumeration</b>: a closed list of ${group.propertyKind === 'data' ? 'values' : 'individuals'}:`;
    default:
      return `${head} the <b>${group.operator}</b> of these classes:`;
  }
}

export function showClassExpressionModal(group: ClassExpressionGroup): void {
  const overlay = ensureOverlay();
  const info = OPERATOR_INFO[group.operator];
  // The opposite end of the property: its range when the expression is on the domain, and vice versa.
  const counterpartLabel = group.position === 'domain' ? 'Range' : 'Domain';
  const lines: string[] = [];
  if (group.counterpart) lines.push(`${counterpartLabel}: <code>${escapeHtml(group.counterpart)}</code>`);
  if (group.operator === 'oneOf' && group.members.length > 0) {
    lines.push(`Drawn against the class${group.members.length > 1 ? 'es' : ''} of these individuals: ${group.members.map((m) => `<code>${escapeHtml(m)}</code>`).join(', ')}`);
  }
  const extra = lines.map((l) => `<p style="margin:8px 0 0 0;font-size:12px;color:#444;">${l}</p>`).join('');

  overlay.innerHTML = `
    <div class="class-expr-modal" style="background:#fff;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,0.2);
         max-width:420px;width:90%;padding:18px 20px;font-family:inherit;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:15px;color:#2c3e50;">${info.glyph} ${info.title}</h3>
        <button type="button" class="class-expr-modal-close" title="Close"
          style="border:none;background:none;font-size:18px;cursor:pointer;color:#888;line-height:1;">×</button>
      </div>
      <p style="margin:10px 0 2px 0;font-size:12px;color:#666;">${introHtml(group)}</p>
      <div style="margin-top:6px;">${chipsHtml(group)}</div>
      ${extra}
      <p style="margin:10px 0 0 0;font-size:12px;color:#444;background:#f5f1fb;border-radius:4px;padding:6px 8px;">
        Example: ${expressionExample(group)}
      </p>
    </div>`;
  const closeBtn = overlay.querySelector('.class-expr-modal-close') as HTMLButtonElement | null;
  if (closeBtn) closeBtn.addEventListener('click', hideClassExpressionModal);
  overlay.style.display = 'flex';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Human "either a A or a B" / "a A, a B, or a C" phrasing for an exclusive choice of class. */
function orList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `a ${names[0]}`;
  if (names.length === 2) return `either a ${names[0]} or a ${names[1]}`;
  const last = names[names.length - 1];
  return `a ${names.slice(0, -1).join(', a ')}, or a ${last}`;
}

/** Human "both a A and a B" / "a A, a B, and a C, all at once" phrasing for a conjunction of classes. */
function andList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `a ${names[0]}`;
  if (names.length === 2) return `both a ${names[0]} and a ${names[1]}`;
  const last = names[names.length - 1];
  return `a ${names.slice(0, -1).join(', a ')}, and a ${last}, all at once`;
}
