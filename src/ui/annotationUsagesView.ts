/**
 * Where an annotation property is used, on the page (#139): the list shown in the Edit annotation property dialog
 * ("Where it is used (N)", collapsed) and in the popover of the Annotation Properties menu's "show usages" button.
 */
import type { AnnotationUsage } from '../lib/annotationUsages';

/** The list of usages: one line per term, "<label> (<kind>): <values>"; "Not used" when there is none. */
export function renderAnnotationUsages(container: HTMLElement, usages: AnnotationUsage[]): void {
  container.textContent = '';
  if (usages.length === 0) {
    const none = document.createElement('div');
    none.className = 'annotation-usage-none';
    none.textContent = 'Not used';
    none.style.cssText = 'font-size: 11px; color: #888;';
    container.appendChild(none);
    return;
  }
  const list = document.createElement('ul');
  list.style.cssText = 'margin: 0; padding-left: 16px; font-size: 11px;';
  for (const usage of usages) {
    const item = document.createElement('li');
    item.className = 'annotation-usage';
    item.title = usage.subject;
    item.style.cssText = 'margin-bottom: 2px; word-break: break-word;';
    const term = document.createElement('strong');
    term.textContent = usage.label;
    const kind = document.createElement('span');
    kind.textContent = ` (${usage.kind}): `;
    kind.style.color = '#777';
    item.append(term, kind, document.createTextNode(usage.values.join(', ')));
    list.appendChild(item);
  }
  container.appendChild(list);
}

/** Fill the dialog's collapsed "Where it is used (N)" section; it is closed each time the dialog opens. */
export function fillUsagesSection(details: HTMLDetailsElement, usages: AnnotationUsage[]): void {
  details.open = false;
  details.querySelector('summary')!.textContent = `Where it is used (${usages.length})`;
  renderAnnotationUsages(details.querySelector<HTMLElement>('.annotation-usages-list')!, usages);
}

let popover: HTMLElement | null = null;

export function hideUsagesPopover(): void {
  if (popover) popover.style.display = 'none';
}

/** Show the usages of `title` in a popover below `anchor`, or hide it when it is already shown for it. */
export function toggleUsagesPopover(anchor: HTMLElement, title: string, usages: AnnotationUsage[]): void {
  if (!popover || !document.body.contains(popover)) {
    popover = document.createElement('div');
    popover.id = 'annotationUsagesPopover';
    popover.style.cssText = `position: fixed; z-index: 10001; display: none; max-width: 420px; max-height: 320px; overflow-y: auto;
      background: white; border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); padding: 8px;`;
    document.body.appendChild(popover);
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (popover && !popover.contains(target) && !target.closest('.ap-usages-btn')) hideUsagesPopover();
    });
  }
  if (popover.style.display === 'block' && popover.dataset.for === title) {
    hideUsagesPopover();
    return;
  }
  popover.dataset.for = title;
  popover.textContent = '';
  const heading = document.createElement('div');
  heading.textContent = `Where ${title} is used (${usages.length})`;
  heading.style.cssText = 'font-size: 11px; font-weight: bold; margin-bottom: 6px;';
  const body = document.createElement('div');
  renderAnnotationUsages(body, usages);
  popover.append(heading, body);
  const box = anchor.getBoundingClientRect();
  popover.style.left = `${Math.max(4, Math.min(box.left, window.innerWidth - 430))}px`;
  popover.style.top = `${box.bottom + 4}px`;
  popover.style.display = 'block';
}
