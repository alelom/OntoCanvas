/**
 * The list of the open ontology's versions, opened from the bottom bar (#133): newest first, the open one
 * marked, each with where it was found. Choosing another one opens it.
 */
import type { AvailableVersions, VersionEntry } from '../lib/ontologyVersions';

const SOURCE_TEXT: Record<VersionEntry['source'], string> = {
  loaded: 'open now',
  latest: 'latest release',
  github: 'GitHub tag',
  prior: 'earlier version (owl:priorVersion)',
};

let listElement: HTMLElement | null = null;

function ensureList(): HTMLElement {
  if (listElement && document.body.contains(listElement)) return listElement;
  listElement = document.createElement('div');
  listElement.id = 'ontologyVersionsList';
  listElement.style.cssText = `
    position: fixed; z-index: 10000; display: none; min-width: 220px; max-height: 320px; overflow-y: auto;
    background: white; border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    padding: 4px 0; font-size: 12px;`;
  document.body.appendChild(listElement);
  document.addEventListener('click', (e) => {
    if (listElement && !listElement.contains(e.target as Node) && (e.target as HTMLElement).id !== 'ontologyVersionsBtn') hideVersionList();
  });
  return listElement;
}

export function hideVersionList(): void {
  if (listElement) listElement.style.display = 'none';
}

/** Open the list above `anchor`, or close it when it is already open. */
export function toggleVersionList(anchor: HTMLElement, available: AvailableVersions, onChoose: (entry: VersionEntry) => void): void {
  const list = ensureList();
  if (list.style.display === 'block') {
    hideVersionList();
    return;
  }
  list.textContent = '';
  for (const entry of available.entries) {
    const open = entry.source === 'loaded';
    const item = document.createElement('div');
    item.dataset.version = entry.version;
    item.textContent = `${open ? '✓ ' : ''}${entry.version} · ${SOURCE_TEXT[entry.source]}`;
    item.title = entry.url ?? '';
    const choosable = !open && !!entry.url;
    item.style.cssText = `padding: 6px 12px; white-space: nowrap; cursor: ${choosable ? 'pointer' : 'default'}; color: ${open ? '#666' : '#333'};`;
    if (choosable) {
      item.addEventListener('mouseenter', () => { item.style.background = '#f0f0f0'; });
      item.addEventListener('mouseleave', () => { item.style.background = ''; });
    }
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!choosable) return;
      hideVersionList();
      onChoose(entry);
    });
    list.appendChild(item);
  }
  const box = anchor.getBoundingClientRect();
  list.style.left = `${box.left}px`;
  list.style.bottom = `${window.innerHeight - box.top + 4}px`;
  list.style.display = 'block';
}
