/**
 * Escape text for use in HTML, in element content and in quoted attributes. For anything that did not come
 * from the app itself: a label read from an imported ontology is remote, untrusted input (#104).
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
