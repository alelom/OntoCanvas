/** The input types that take typed text: only there do Ctrl+Z and Ctrl+Y belong to the field. */
const TYPED_INPUT_TYPES = new Set(['text', 'search', 'url', 'email', 'number', 'password', 'tel']);

function isContentEditable(el: Element): boolean {
  if ((el as HTMLElement).isContentEditable) return true;
  // jsdom does not implement isContentEditable; the attribute says the same.
  const attr = el.getAttribute('contenteditable');
  return attr !== null && attr !== 'false';
}

/** True for any input (of whatever type), textarea or contenteditable element: keys such as Delete are left to every field. */
export function isFieldElement(el: Element | null | undefined): boolean {
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || isContentEditable(el);
}

/**
 * True when the element is somewhere the user types text: a text-like input, a textarea or a contenteditable (such as
 * an editor's content). A checkbox, a radio or a range keeps the focus after a click, but nothing is typed into it,
 * so the ontology's undo must still work there.
 */
export function isTextEditingElement(el: Element | null | undefined): boolean {
  if (!el) return false;
  if (el.tagName === 'INPUT') return TYPED_INPUT_TYPES.has((el as HTMLInputElement).type);
  return el.tagName === 'TEXTAREA' || isContentEditable(el);
}
