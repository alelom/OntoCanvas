/**
 * Edit node modal subsection: Example images list, Add button, drop zone.
 * Stateless UI: receives callbacks for add, delete, open, uris change. No store/files imports.
 */

export interface ExampleImagesSectionOptions {
  nodeId: string;
  isLocal: boolean;
  initialUris: string[];
  onAddImage: (file: File) => Promise<string | null>;
  onDelete: (uri: string) => void;
  onOpen: (uri: string) => void;
  onUrisChange: (uris: string[]) => void;
}

export interface ExampleImagesSectionApi {
  getCurrentUris: () => string[];
}

const SECTION_STYLE = 'margin-top: 12px; padding: 8px; background: #f9f9f9; border-radius: 4px;';
const WARNING_STYLE = 'font-size: 11px; color: #b8860b; margin-bottom: 8px;';
const LIST_ITEM_STYLE = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 11px;';
const LINK_STYLE = 'color: #3498db; cursor: pointer; text-decoration: none; word-break: break-all;';
const DROP_ZONE_STYLE = 'border: 2px dashed #ccc; border-radius: 4px; padding: 12px; text-align: center; font-size: 11px; color: #666; margin-top: 8px; background: #fafafa;';

function renderList(
  listEl: HTMLElement,
  uris: string[],
  isLocal: boolean,
  onOpen: (uri: string) => void,
  changeCallback: (uris: string[]) => void
): void {
  listEl.innerHTML = '';
  for (const uri of uris) {
    const row = document.createElement('div');
    row.style.cssText = LIST_ITEM_STYLE;
    const link = document.createElement('a');
    link.href = '#';
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
        changeCallback(uris.filter((u) => u !== uri));
      });
      row.appendChild(bin);
    }
    listEl.appendChild(row);
  }
}

/**
 * Initialize the Example images subsection inside the given container.
 * Renders heading, warning when !isLocal, list, Add button, drop zone.
 * Returns getCurrentUris so main can read the list on OK.
 */
export function initExampleImagesSection(
  container: HTMLElement,
  options: ExampleImagesSectionOptions
): ExampleImagesSectionApi {
  const { nodeId, isLocal, initialUris, onAddImage, onDelete, onOpen, onUrisChange } = options;
  let currentUris = [...initialUris];

  container.style.cssText = SECTION_STYLE;
  container.innerHTML = '';

  const heading = document.createElement('strong');
  heading.style.fontSize = '12px';
  heading.textContent = 'Example images';
  container.appendChild(heading);

  if (!isLocal) {
    const warning = document.createElement('p');
    warning.style.cssText = WARNING_STYLE;
    warning.textContent = 'Ontology is opened from a URL. Example images are read-only; add or remove images only when editing a local file.';
    container.appendChild(warning);
  }

  const listEl = document.createElement('div');
  listEl.style.marginTop = '8px';
  container.appendChild(listEl);

  const updateList = (uris: string[]) => {
    currentUris = uris;
    onUrisChange(uris);
    renderList(listEl, uris, isLocal, onOpen, updateList);
  };
  renderList(listEl, currentUris, isLocal, onOpen, updateList);

  if (isLocal) {
    const addRow = document.createElement('div');
    addRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap;';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = '+ Add example image';
    addBtn.style.cssText = 'padding: 4px 8px; font-size: 11px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;';
    addRow.appendChild(addBtn);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    container.appendChild(fileInput);

    addBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      const newUri = await onAddImage(file);
      if (newUri) {
        updateList([...currentUris, newUri]);
      }
    });

    const dropZone = document.createElement('div');
    dropZone.style.cssText = DROP_ZONE_STYLE;
    dropZone.textContent = 'Drop image file here';
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.background = '#eee';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.background = '#fafafa';
    });
    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.background = '#fafafa';
      const file = e.dataTransfer?.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      const newUri = await onAddImage(file);
      if (newUri) {
        updateList([...currentUris, newUri]);
      }
    });

    container.appendChild(addRow);
    container.appendChild(dropZone);
  }

  return {
    getCurrentUris: () => [...currentUris],
  };
}
