/**
 * Draws a property menu's groups (#137, layout decided by ./propertyMenuGroups): the own rows, then "From other
 * ontologies (N)" with a heading per source, then "Deprecated (N)", then "Not used (N)". They always start collapsed,
 * so the open ontology's own properties lead. A deprecated row is greyed and struck through, with the reason (its
 * comment) as tooltip.
 *
 * Rows are built by each menu; a row's name element carries the class `prop-name`.
 */
import type { MenuEntry, MenuGroups } from './propertyMenuGroups';

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

function collapsible(group: string, title: string): HTMLDetailsElement {
  const details = document.createElement('details');
  details.className = 'prop-menu-group';
  details.dataset.group = group;
  details.style.cssText = 'margin-top: 8px; border-top: 1px solid #ddd; padding-top: 4px;';
  const summary = document.createElement('summary');
  summary.textContent = title;
  summary.style.cssText = 'cursor: pointer; font-size: 11px; color: #555; margin-bottom: 4px;';
  details.appendChild(summary);
  return details;
}

export function renderMenuGroups<T extends { comment?: string | null }>(
  container: HTMLElement,
  groups: MenuGroups<T>,
  renderRow: (entry: MenuEntry<T>) => HTMLElement
): void {
  const draw = (entry: MenuEntry<T>): HTMLElement => {
    const row = renderRow(entry);
    if (entry.deprecated) markDeprecated(row, entry.item.comment);
    return row;
  };
  for (const entry of groups.own) container.appendChild(draw(entry));

  const externalCount = groups.external.reduce((n, g) => n + g.entries.length, 0);
  if (externalCount > 0) {
    const details = collapsible('external', `From other ontologies (${externalCount})`);
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

  if (groups.deprecated.length > 0) {
    const details = collapsible('deprecated', `Deprecated (${groups.deprecated.length})`);
    for (const entry of groups.deprecated) details.appendChild(draw(entry));
    container.appendChild(details);
  }

  if (groups.unused.length > 0) {
    const details = collapsible('unused', `Not used (${groups.unused.length})`);
    for (const entry of groups.unused) details.appendChild(draw(entry));
    container.appendChild(details);
  }
}

