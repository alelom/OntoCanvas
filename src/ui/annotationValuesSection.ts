/**
 * Edit-class modal subsection: the multi-value editor for a single textual (non-boolean)
 * annotation property. Renders the current values (URL-like values as clickable links, others
 * as plain text) each with a delete control, and — when editing a local file — a text input
 * plus an Add button to append new values.
 *
 * Generic replacement for the old exampleImage-only section: every textual annotation property
 * (including exampleImage) uses this.
 */
import { resolveImageUrl } from '../lib/exampleImageUrlValidation';
import { isUrlLikeValue } from '../lib/annotationValues';

export interface AnnotationValuesSectionOptions {
  /** Local name of the annotation property (for input ids / labels). */
  propertyName: string;
  /** rdfs:comment of the property, used as the input placeholder when present. */
  comment?: string | null;
  /** Whether the ontology is editable locally (controls add/delete affordances). */
  isLocal: boolean;
  initialValues: string[];
  /** Called whenever the value list changes (add/delete). */
  onChange: (values: string[]) => void;
  /** Open a link value (e.g. in a new tab). */
  onOpen?: (value: string) => void;
}

export interface AnnotationValuesSectionApi {
  getValues: () => string[];
}

const ROW_STYLE = 'display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 11px;';
const LINK_STYLE = 'color: #3498db; cursor: pointer; text-decoration: none; word-break: break-all;';
const TEXT_STYLE = 'word-break: break-all;';
const INPUT_STYLE = 'flex: 1; padding: 4px 8px; font-size: 11px; border: 1px solid #ccc; border-radius: 4px;';

function renderList(
  listEl: HTMLElement,
  values: string[],
  isLocal: boolean,
  onOpen: ((v: string) => void) | undefined,
  onDelete: (index: number) => void
): void {
  listEl.innerHTML = '';
  values.forEach((value, index) => {
    const row = document.createElement('div');
    row.style.cssText = ROW_STYLE;

    if (isUrlLikeValue(value)) {
      const link = document.createElement('a');
      link.href = value;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.style.cssText = LINK_STYLE;
      link.textContent = value;
      link.title = value;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        onOpen?.(value);
      });
      row.appendChild(link);
    } else {
      const span = document.createElement('span');
      span.style.cssText = TEXT_STYLE;
      span.textContent = value;
      span.title = value;
      row.appendChild(span);
    }

    if (isLocal) {
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '✕';
      del.title = 'Remove value';
      del.style.cssText = 'background: none; border: none; cursor: pointer; color: #c0392b; font-size: 14px; padding: 0 4px; line-height: 1;';
      del.addEventListener('click', () => onDelete(index));
      row.appendChild(del);
    }
    listEl.appendChild(row);
  });
}

export function initAnnotationValuesSection(
  container: HTMLElement,
  options: AnnotationValuesSectionOptions
): AnnotationValuesSectionApi {
  const { comment, isLocal, initialValues, onChange, onOpen } = options;
  let values = [...initialValues];

  container.innerHTML = '';

  const listEl = document.createElement('div');
  container.appendChild(listEl);

  const deleteValue = (index: number): void => {
    if (index < 0 || index >= values.length) return;
    update(values.filter((_, i) => i !== index));
  };

  const update = (next: string[]) => {
    values = next;
    onChange(values);
    renderList(listEl, values, isLocal, onOpen, deleteValue);
  };

  renderList(listEl, values, isLocal, onOpen, deleteValue);

  if (isLocal) {
    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-top: 4px;';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = comment && comment.trim() ? comment.trim() : 'Enter a value';
    input.style.cssText = INPUT_STYLE;

    const addValue = () => {
      const raw = input.value.trim();
      if (!raw) return;
      // For link-like values, normalise GitHub blob URLs to raw (and leave relative paths as-is).
      const toStore = isUrlLikeValue(raw) ? (resolveImageUrl(raw, null) ?? raw) : raw;
      update([...values, toStore]);
      input.value = '';
    };

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.textContent = 'Add';
    addButton.title = 'Add this value';
    addButton.style.cssText = 'padding: 4px 10px; font-size: 11px; cursor: pointer; white-space: nowrap;';
    addButton.addEventListener('click', addValue);

    // Enter adds the value WITHOUT closing the modal: stopPropagation prevents the modal-level
    // Enter handler (confirmRename) from firing. blur still adds when clicking away.
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        addValue();
      }
    });
    input.addEventListener('blur', addValue);

    inputRow.appendChild(input);
    inputRow.appendChild(addButton);
    container.appendChild(inputRow);
  }

  return { getValues: () => [...values] };
}
