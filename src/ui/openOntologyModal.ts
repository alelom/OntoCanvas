import { getLastFileFromIndexedDB, getLastUrlFromIndexedDB, getRecentlyOpenedFromIndexedDB, type RecentlyOpenedEntry } from '../storage';
import { EXAMPLE_ONTOLOGIES } from './exampleOntologies';

/**
 * Callback type for loading an ontology from a file.
 */
export type OnLoadFromFileCallback = () => Promise<void>;

/**
 * Callback type for loading an ontology from a URL.
 */
export type OnLoadFromUrlCallback = (url: string) => Promise<void>;

/**
 * Callback type for loading the last opened file.
 */
export type OnLoadLastOpenedFileCallback = () => Promise<void>;

/**
 * Callback type for loading the last opened URL.
 */
export type OnLoadLastOpenedUrlCallback = () => Promise<void>;

/**
 * Callback type for re-opening an entry from the "Previously opened" history.
 */
export type OnOpenRecentEntryCallback = (entry: RecentlyOpenedEntry) => Promise<void>;

let modalElement: HTMLElement | null = null;
let onLoadFromFile: OnLoadFromFileCallback | null = null;
let onLoadFromUrl: OnLoadFromUrlCallback | null = null;
let onLoadLastOpenedFile: OnLoadLastOpenedFileCallback | null = null;
let onLoadLastOpenedUrl: OnLoadLastOpenedUrlCallback | null = null;
let onOpenRecentEntry: OnOpenRecentEntryCallback | null = null;

/**
 * Create a left-aligned row button matching the modal's "recent item" style.
 */
function createRowButton(mainText: string, titleText?: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.style.cssText = `
    padding: 8px 12px;
    font-size: 13px;
    cursor: pointer;
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    text-align: left;
  `;
  btn.textContent = mainText;
  if (titleText) btn.title = titleText;
  return btn;
}

/**
 * Create a collapsible <details> section with the given summary label and content container.
 */
function createCollapsibleSection(summaryText: string, contentContainer: HTMLElement): HTMLDetailsElement {
  const details = document.createElement('details');
  details.style.cssText = 'margin-top: 4px;';
  const summary = document.createElement('summary');
  summary.textContent = summaryText;
  summary.style.cssText = 'cursor: pointer; font-weight: 600; font-size: 13px; padding: 4px 0;';
  contentContainer.style.cssText = 'display: flex; flex-direction: column; gap: 6px; margin-top: 8px;';
  details.appendChild(summary);
  details.appendChild(contentContainer);
  return details;
}

/**
 * Initialize the open ontology modal.
 */
export function initOpenOntologyModal(
  onFile: OnLoadFromFileCallback,
  onUrl: OnLoadFromUrlCallback,
  onLastFile: OnLoadLastOpenedFileCallback,
  onLastUrl: OnLoadLastOpenedUrlCallback,
  onRecentEntry: OnOpenRecentEntryCallback
): void {
  onLoadFromFile = onFile;
  onLoadFromUrl = onUrl;
  onLoadLastOpenedFile = onLastFile;
  onLoadLastOpenedUrl = onLastUrl;
  onOpenRecentEntry = onRecentEntry;

  // Create modal element if it doesn't exist
  if (!modalElement) {
    modalElement = document.createElement('div');
    modalElement.id = 'openOntologyModal';
    modalElement.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: white;
      border-radius: 8px;
      padding: 24px;
      min-width: 400px;
      max-width: 500px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    `;

    const title = document.createElement('h2');
    title.style.cssText = `
      margin: 0 0 20px 0;
      font-size: 20px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    const icon = document.createElement('img');
    icon.src = `${import.meta.env.BASE_URL}OntoCanvas.png`;
    icon.alt = 'OntoCanvas';
    icon.style.cssText = 'width: 24px; height: 24px;';
    title.appendChild(icon);
    const titleText = document.createTextNode('Open ontology');
    title.appendChild(titleText);

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 12px;
    `;

    // Open from file button
    const fileBtn = document.createElement('button');
    fileBtn.textContent = 'Open Ontology from TTL file';
    fileBtn.className = 'primary';
    fileBtn.style.cssText = `
      padding: 12px 16px;
      font-size: 14px;
      cursor: pointer;
    `;
    fileBtn.addEventListener('click', async () => {
      if (onLoadFromFile) {
        await onLoadFromFile();
        hideModal();
      }
    });

    // Open from URL button
    const urlBtn = document.createElement('button');
    urlBtn.textContent = 'Open ontology from URL';
    urlBtn.className = 'primary';
    urlBtn.style.cssText = `
      padding: 12px 16px;
      font-size: 14px;
      cursor: pointer;
    `;
    urlBtn.addEventListener('click', async () => {
      const url = await showUrlInputDialog();
      if (url && onLoadFromUrl) {
        await onLoadFromUrl(url);
        hideModal();
      }
    });

    // Load last opened file button
    const lastOpenedFileBtn = document.createElement('button');
    lastOpenedFileBtn.id = 'openOntologyLoadLastFile';
    lastOpenedFileBtn.style.cssText = `
      padding: 12px 16px;
      font-size: 14px;
      cursor: pointer;
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 4px;
      text-align: left;
    `;
    lastOpenedFileBtn.addEventListener('click', async () => {
      if (onLoadLastOpenedFile) {
        // Check if button is disabled, but still try to load if callback exists
        if (lastOpenedFileBtn.disabled) {
          return;
        }
        await onLoadLastOpenedFile();
        hideModal();
      }
    });

    // Load last opened URL button
    const lastOpenedUrlBtn = document.createElement('button');
    lastOpenedUrlBtn.id = 'openOntologyLoadLastUrl';
    lastOpenedUrlBtn.style.cssText = `
      padding: 12px 16px;
      font-size: 14px;
      cursor: pointer;
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 4px;
      text-align: left;
    `;
    lastOpenedUrlBtn.addEventListener('click', async () => {
      if (onLoadLastOpenedUrl) {
        // Check if button is disabled, but still try to load if callback exists
        if (lastOpenedUrlBtn.disabled) {
          return;
        }
        await onLoadLastOpenedUrl();
        hideModal();
      }
    });

    buttonContainer.appendChild(fileBtn);
    buttonContainer.appendChild(urlBtn);
    buttonContainer.appendChild(lastOpenedFileBtn);
    buttonContainer.appendChild(lastOpenedUrlBtn);

    // "Previously opened" collapsible history (populated on show/init from IndexedDB).
    const recentList = document.createElement('div');
    recentList.id = 'openOntologyRecentList';
    const recentSection = createCollapsibleSection('Previously opened', recentList);

    // "Example ontologies" collapsible section (static list, different domains).
    const examplesList = document.createElement('div');
    EXAMPLE_ONTOLOGIES.forEach((example) => {
      const btn = createRowButton(`${example.label} — ${example.domain}`, example.url);
      btn.addEventListener('click', async () => {
        if (onLoadFromUrl) {
          await onLoadFromUrl(example.url);
          hideModal();
        }
      });
      examplesList.appendChild(btn);
    });
    const examplesSection = createCollapsibleSection('Example ontologies', examplesList);

    modalContent.appendChild(title);
    modalContent.appendChild(buttonContainer);
    modalContent.appendChild(recentSection);
    modalContent.appendChild(examplesSection);
    modalElement.appendChild(modalContent);

    // Close modal when clicking outside
    modalElement.addEventListener('click', (e) => {
      if (e.target === modalElement) {
        hideModal();
      }
    });

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalElement?.style.display !== 'none') {
        hideModal();
      }
    });

    document.body.appendChild(modalElement);
  } else if (!document.body.contains(modalElement)) {
    document.body.appendChild(modalElement);
  }

  // Update last opened buttons and recently-opened history (non-blocking)
  updateLastOpenedButtons().catch(() => {
    // Silently handle errors - buttons will just show "(none)"
  });
  updateRecentlyOpenedList().catch(() => {
    // Silently handle errors - the section will just show "(none yet)".
  });
}

/**
 * Show the modal.
 */
export function showOpenOntologyModal(): void {
  if (!modalElement) return;
  updateLastOpenedButtons();
  updateRecentlyOpenedList().catch(() => {
    // Silently handle errors - the section will just show "(none yet)".
  });
  modalElement.style.display = 'flex';
}

/**
 * Hide the modal.
 */
export function hideOpenOntologyModal(): void {
  if (!modalElement) return;
  modalElement.style.display = 'none';
}

/**
 * Populate the "Previously opened" collapsible section from IndexedDB history
 * (most-recently-opened first, capped at MAX_RECENTLY_OPENED entries).
 */
async function updateRecentlyOpenedList(): Promise<void> {
  const container = document.getElementById('openOntologyRecentList');
  if (!container) return;
  container.innerHTML = '';

  const entries = await getRecentlyOpenedFromIndexedDB();
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = '(none yet)';
    empty.style.cssText = 'font-size: 12px; color: #999; padding: 4px 0;';
    container.appendChild(empty);
    return;
  }

  for (const entry of entries) {
    const label = entry.kind === 'url' ? entry.name : (entry.pathHint ?? entry.name);
    const titleText = entry.kind === 'url' ? entry.url : (entry.pathHint ?? entry.name);
    const icon = entry.kind === 'url' ? '🔗' : '📄';
    const btn = createRowButton(`${icon} ${label}`, titleText);
    btn.addEventListener('click', async () => {
      if (onOpenRecentEntry) {
        await onOpenRecentEntry(entry);
        hideModal();
      }
    });
    container.appendChild(btn);
  }
}

/**
 * Update the "Load last opened" buttons based on stored data.
 */
async function updateLastOpenedButtons(): Promise<void> {
  if (!modalElement) return;
  
  // Update last opened file button (stored value has handle + pathHint; display name from pathHint or handle.name)
  const fileBtn = document.getElementById('openOntologyLoadLastFile') as HTMLButtonElement;
  if (fileBtn) {
    const storedFile = await getLastFileFromIndexedDB();
    const displayName = storedFile?.pathHint ?? storedFile?.handle?.name ?? '(unknown)';
    if (storedFile && storedFile.handle) {
      fileBtn.textContent = `Open last opened file: ${displayName}`;
      fileBtn.title = storedFile.pathHint ?? displayName;
      fileBtn.disabled = false;
      fileBtn.dataset.hasLast = '1';
      fileBtn.style.background = '#f5f5f5';
      fileBtn.style.color = '#333';
    } else {
      fileBtn.textContent = 'Open last opened file: (none)';
      fileBtn.title = 'No previously opened file';
      fileBtn.disabled = true;
      fileBtn.dataset.hasLast = '';
      fileBtn.style.background = '#f5f5f5';
      fileBtn.style.color = '#999';
    }
  }

  // Update last opened URL button
  const urlBtn = document.getElementById('openOntologyLoadLastUrl') as HTMLButtonElement;
  if (urlBtn) {
    const storedUrl = await getLastUrlFromIndexedDB();
    if (storedUrl && storedUrl.url) {
      // Truncate URL if too long for display
      const displayUrl = storedUrl.url.length > 50 
        ? storedUrl.url.substring(0, 47) + '...'
        : storedUrl.url;
      urlBtn.textContent = `Open last opened URL: ${displayUrl}`;
      urlBtn.title = storedUrl.url;
      urlBtn.disabled = false;
      urlBtn.dataset.hasLast = '1';
      urlBtn.style.background = '#f5f5f5';
      urlBtn.style.color = '#333';
    } else {
      urlBtn.textContent = 'Open last opened URL: (none)';
      urlBtn.title = 'No previously opened URL';
      urlBtn.disabled = true;
      urlBtn.dataset.hasLast = '';
      urlBtn.style.background = '#f5f5f5';
      urlBtn.style.color = '#999';
    }
  }
}

/**
 * Show a dialog to input a URL.
 */
function showUrlInputDialog(): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10001;
    `;

    const dialogContent = document.createElement('div');
    dialogContent.style.cssText = `
      background: white;
      border-radius: 8px;
      padding: 24px;
      min-width: 400px;
      max-width: 500px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    `;

    const title = document.createElement('h3');
    title.textContent = 'Open ontology from URL';
    title.style.cssText = `
      margin: 0 0 16px 0;
      font-size: 18px;
      font-weight: 600;
    `;

    const input = document.createElement('input');
    input.type = 'url';
    input.placeholder = 'https://example.com/ontology.ttl';
    input.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      font-size: 14px;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-sizing: border-box;
      margin-bottom: 16px;
    `;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      padding: 8px 16px;
      font-size: 14px;
      cursor: pointer;
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 4px;
    `;
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(dialog);
      resolve(null);
    });

    const okBtn = document.createElement('button');
    okBtn.textContent = 'Open';
    okBtn.className = 'primary';
    okBtn.style.cssText = `
      padding: 8px 16px;
      font-size: 14px;
      cursor: pointer;
    `;
    okBtn.addEventListener('click', () => {
      const url = input.value.trim();
      if (url) {
        document.body.removeChild(dialog);
        resolve(url);
      }
    });

    // Handle Enter key
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        okBtn.click();
      } else if (e.key === 'Escape') {
        cancelBtn.click();
      }
    });

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(okBtn);

    dialogContent.appendChild(title);
    dialogContent.appendChild(input);
    dialogContent.appendChild(buttonContainer);

    dialog.appendChild(dialogContent);
    document.body.appendChild(dialog);

    // Focus input
    setTimeout(() => input.focus(), 100);

    // Close on outside click
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        document.body.removeChild(dialog);
        resolve(null);
      }
    });
  });
}

// Export alias for consistency
export const hideModal = hideOpenOntologyModal;
