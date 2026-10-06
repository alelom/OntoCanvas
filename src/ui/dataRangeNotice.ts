/**
 * "Range as declared" line under the range dropdown of the Edit-data-property modal (#63): the dropdown
 * can only show a named datatype, so an anonymous data range (facets such as `xsd:decimal [0.0, 1.0]`,
 * a datatype union, …) is spelled out here, read-only. Kept out of main.ts.
 */

const NOTICE_ID = 'editDataPropRangeExpression';

/** Show `expression` under `rangeSelect` (hide the line when null). */
export function showDataRangeNotice(rangeSelect: HTMLSelectElement, expression: string | null | undefined): void {
  let el = document.getElementById(NOTICE_ID) as HTMLDivElement | null;
  if (!expression) {
    if (el) el.style.display = 'none';
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.id = NOTICE_ID;
    el.style.cssText = 'font-size: 12px; color: #2c3e50; margin-top: 4px; padding: 6px 8px; background: #f2f6fa; border: 1px solid #d5e0ea; border-radius: 4px;';
    rangeSelect.insertAdjacentElement('afterend', el);
  }
  el.textContent = '';
  const label = document.createElement('b');
  label.textContent = 'Range as declared: ';
  const code = document.createElement('code');
  code.textContent = expression;
  const note = document.createElement('div');
  note.style.cssText = 'color: #666; margin-top: 2px;';
  note.textContent = 'The facets aren’t editable yet; changing the range above replaces them.';
  el.append(label, code, note);
  el.style.display = 'block';
}
