/** True when the element is somewhere the user types text: an input, a textarea or a contenteditable (such as an editor's content). */
export function isTextEditingElement(el: Element | null | undefined): boolean {
  if (!el) return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
  const html = el as HTMLElement;
  if (html.isContentEditable) return true;
  // jsdom does not implement isContentEditable; the attribute says the same.
  const attr = el.getAttribute('contenteditable');
  return attr !== null && attr !== 'false';
}
