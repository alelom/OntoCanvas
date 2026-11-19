/**
 * Whether a term's tooltip shows its rdfs:comment after its definition (#247). On by default; remembered in the browser.
 * A term with no skos:definition shows its rdfs:comment as the description whatever this says.
 */

const STORAGE_KEY = 'ontocanvas.showComment';

/** The choice when the browser keeps nothing (a private window, blocked storage). */
let fallback = true;

export function getShowComment(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored !== 'false';
  } catch {
    // Storage blocked: the choice lasts the session.
  }
  return fallback;
}

export function setShowComment(on: boolean): void {
  fallback = on;
  try {
    localStorage.setItem(STORAGE_KEY, String(on));
  } catch {
    // Storage blocked: the choice lasts the session.
  }
}

/** Fills the bottom bar's place for the choice (#showCommentSetting); does nothing when the page has none (embedded). */
export function mountShowCommentSetting(): void {
  const element = document.getElementById('showCommentSetting');
  if (!element) return;
  const label = document.createElement('label');
  label.title = 'Show a term’s rdfs:comment after its skos:definition in its tooltip';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = getShowComment();
  box.addEventListener('change', () => setShowComment(box.checked));
  label.append(box, ' Show comments');
  element.replaceChildren(label);
}
