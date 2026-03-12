/**
 * Edit class modal subsection: Example images list and Add button.
 * Now uses URL input instead of file picker.
 */

import { validateExampleImageUrl, resolveImageUrl } from '../lib/exampleImageUrlValidation';

export interface ExampleImagesSectionOptions {
  nodeId: string;
  isLocal: boolean;
  initialUris: string[];
  ontologyLocation: string | null; // URL or path of the ontology file
  onAddImage: (url: string) => Promise<void>; // Changed from File to string
  onDelete: (uri: string) => void;
  onOpen: (uri: string) => void;
  onUrisChange: (uris: string[]) => void;
}

export interface ExampleImagesSectionApi {
  getCurrentUris: () => string[];
}

const SECTION_STYLE = 'margin-top: 12px; padding: 8px; background: #f9f9f9; border-radius: 4px;';
const LIST_ITEM_STYLE = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 11px;';
const LINK_STYLE = 'color: #3498db; cursor: pointer; text-decoration: none; word-break: break-all;';

const INPUT_STYLE = 'flex: 1; padding: 4px 8px; font-size: 11px; border: 1px solid #ccc; border-radius: 4px;';
const ERROR_STYLE = 'color: #c0392b; font-size: 10px; margin-top: 4px;';

function renderList(
  listEl: HTMLElement,
  uris: string[],
  isLocal: boolean,
  onOpen: (uri: string) => void,
  onDelete: (uri: string) => void,
  changeCallback: (uris: string[]) => void
): void {
  listEl.innerHTML = '';
  for (const uri of uris) {
    const row = document.createElement('div');
    row.style.cssText = LIST_ITEM_STYLE;
    const link = document.createElement('a');
    link.href = uri;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.cssText = LINK_STYLE;
    link.textContent = uri;
    link.title = uri;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      onOpen(uri);
    });
    row.appendChild(link);
    if (isLocal) {
      const bin = document.createElement('button');
      bin.type = 'button';
      bin.textContent = '\u2715';
      bin.title = 'Remove example image';
      bin.style.cssText = 'background: none; border: none; cursor: pointer; color: #c0392b; font-size: 14px; padding: 0 4px; line-height: 1;';
      bin.addEventListener('click', () => {
        onDelete(uri);
        changeCallback(uris.filter((u) => u !== uri));
      });
      row.appendChild(bin);
    }
    listEl.appendChild(row);
  }
}

/**
 * Initialize the Example images subsection inside the given container.
 * Renders list and, when isLocal, Add button with URL input.
 */
export function initExampleImagesSection(
  container: HTMLElement,
  options: ExampleImagesSectionOptions
): ExampleImagesSectionApi {
  const { nodeId, isLocal, initialUris, ontologyLocation, onAddImage, onDelete, onOpen, onUrisChange } = options;
  let currentUris = [...initialUris];

  container.style.cssText = SECTION_STYLE;
  container.innerHTML = '';

  const listEl = document.createElement('div');
  listEl.style.marginTop = '8px';
  container.appendChild(listEl);

  const updateList = (uris: string[]) => {
    currentUris = uris;
    onUrisChange(uris);
    renderList(listEl, uris, isLocal, onOpen, onDelete, updateList);
  };
  renderList(listEl, currentUris, isLocal, onOpen, onDelete, updateList);

  if (isLocal) {
    const addRow = document.createElement('div');
    addRow.style.cssText = 'display: flex; flex-direction: column; gap: 4px; margin-top: 8px;';
    
    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';
    
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'Enter image URL (e.g., https://example.com/image.png or img/photo.jpg)';
    urlInput.style.cssText = INPUT_STYLE;
    
    const errorMsg = document.createElement('div');
    errorMsg.style.cssText = ERROR_STYLE;
    errorMsg.style.display = 'none';
    
    let isValidating = false;

    const validateAndAdd = async () => {
      const url = urlInput.value.trim();
      if (!url) return;

      if (isValidating) return;
      isValidating = true;

      // Clear previous error
      errorMsg.style.display = 'none';
      errorMsg.textContent = '';

      // Validate URL
      const validationError = await validateExampleImageUrl(url, ontologyLocation);
      
      if (validationError) {
        errorMsg.textContent = validationError;
        errorMsg.style.display = 'block';
        isValidating = false;
        return;
      }

      // URL is valid, resolve it (converts GitHub blob URLs to raw, resolves relative URLs)
      const resolvedUrl = resolveImageUrl(url, ontologyLocation);
      const urlToSave = resolvedUrl || url; // Use resolved URL if available, otherwise original
      
      // URL is valid, add it
      try {
        await onAddImage(urlToSave);
        updateList([...currentUris, urlToSave]);
        urlInput.value = '';
        errorMsg.style.display = 'none';
      } catch (err) {
        errorMsg.textContent = err instanceof Error ? err.message : 'Failed to add image URL';
        errorMsg.style.display = 'block';
      } finally {
        isValidating = false;
      }
    };

    urlInput.addEventListener('blur', validateAndAdd);
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        validateAndAdd();
      }
    });

    inputRow.appendChild(urlInput);
    addRow.appendChild(inputRow);
    addRow.appendChild(errorMsg);
    container.appendChild(addRow);
  }

  return {
    getCurrentUris: () => [...currentUris],
  };
}
