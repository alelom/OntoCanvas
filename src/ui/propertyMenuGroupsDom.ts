/**
 * Draws a property menu's groups (#137, layout decided by ./propertyMenuGroups): the own rows, then "From other
 * ontologies (N)" with a heading per source, then "Not used on any class (N)". The two are collapsed unless
 * something in them is in effect on the canvas, or the viewer left them open (remembered per viewer and menu).
 * A deprecated row is greyed and struck through, with the reason (its comment) as tooltip.
 *
 * Rows are built by each menu; a row's name element carries the class `prop-name`.
 */
import type { MenuEntry, MenuGroups } from './propertyMenuGroups';

const STORAGE_PREFIX = 'ontocanvas:menuGroup:';

function remembered(menuId: string, group: string): boolean | null {
  try {
    const value = localStorage.getItem(`${STORAGE_PREFIX}${menuId}:${group}`);
    return value === null ? null : value === 'open';
  } catch {
    return null;
  }
}

function remember(menuId: string, group: string, open: boolean): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${menuId}:${group}`, open ? 'open' : 'closed');
  } catch {
    // Storage blocked: the group just starts collapsed next time.
  }
}

function markDeprecated(row: HTMLElement, reason: string | null | undefined): void {
  row.classList.add('prop-deprecated');
  row.style.opacity = '0.6';
  const name = row.querySelector<HTMLElement>('.prop-name');
  if (name) {
    name.style.textDecoration = 'line-through';
    const mark = document.createElement('span');
    mark.className = 'prop-deprecated-mark';
    mark.textContent = 'deprecated';
    mark.style.cssText = 'margin-left: 6px; font-size: 10px; font-weight: normal; color: #a04000; text-decoration: none;';
    name.after(mark);
  }
  row.title = reason || 'Deprecated (owl:deprecated): kept so that data written against earlier releases keeps its meaning.';
}

function collapsible(menuId: string, group: string, title: string, inEffect: boolean): HTMLDetailsElement {
  const details = document.createElement('details');
  details.className = 'prop-menu-group';
  details.dataset.group = group;
  details.open = inEffect || (remembered(menuId, group) ?? false);
  details.style.cssText = 'margin-top: 8px; border-top: 1px solid #ddd; padding-top: 4px;';
  const summary = document.createElement('summary');
  summary.textContent = title;
  summary.style.cssText = 'cursor: pointer; font-size: 11px; color: #555; margin-bottom: 4px;';
  details.appendChild(summary);
  details.addEventListener('toggle', () => remember(menuId, group, details.open));
  return details;
}

export function renderMenuGroups<T extends { comment?: string | null }>(
  container: HTMLElement,
  groups: MenuGroups<T>,
  renderRow: (entry: MenuEntry<T>) => HTMLElement,
  menuId: string
): void {
  const draw = (entry: MenuEntry<T>): HTMLElement => {
    const row = renderRow(entry);
    if (entry.deprecated) markDeprecated(row, entry.item.comment);
    return row;
  };
  for (const entry of groups.own) container.appendChild(draw(entry));

  const externalCount = groups.external.reduce((n, g) => n + g.entries.length, 0);
  if (externalCount > 0) {
    const details = collapsible(menuId, 'external', `From other ontologies (${externalCount})`, groups.externalInEffect);
    for (const { source, entries } of groups.external) {
      const heading = document.createElement('div');
      heading.className = 'prop-menu-source';
      heading.textContent = source;
      heading.title = `Defined in ${source}, not in this ontology.`;
      heading.style.cssText = 'font-size: 10px; color: #777; margin: 6px 0 2px; text-transform: none;';
      details.appendChild(heading);
      for (const entry of entries) details.appendChild(draw(entry));
    }
    container.appendChild(details);
  }

  if (groups.unused.length > 0) {
    const details = collapsible(menuId, 'unused', `Not used on any class (${groups.unused.length})`, groups.unusedInEffect);
    for (const entry of groups.unused) details.appendChild(draw(entry));
    container.appendChild(details);
  }
}

/**
 * Open each collapsed group holding a control whose style is in effect (a hidden relationship type, an active
 * colour, a regex rule), once saved styles have been applied to the menu: what changes the canvas is never hidden.
 */
export function openGroupsInEffect(container: HTMLElement): void {
  container.querySelectorAll<HTMLDetailsElement>('details.prop-menu-group').forEach((details) => {
    const inEffect =
      [...details.querySelectorAll<HTMLInputElement>('.edge-show-cb, .ap-bool-show')].some((cb) => !cb.checked) ||
      [...details.querySelectorAll<HTMLInputElement>('.ap-bool-active')].some((cb) => cb.checked) ||
      [...details.querySelectorAll<HTMLInputElement>('.ap-regex')].some((input) => input.value.trim() !== '');
    if (inEffect) details.open = true;
  });
}
