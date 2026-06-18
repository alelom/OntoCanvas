/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initAnnotationValuesSection } from './annotationValuesSection';

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

function make(overrides: Partial<Parameters<typeof initAnnotationValuesSection>[1]> = {}) {
  const onChange = vi.fn();
  const api = initAnnotationValuesSection(container, {
    propertyName: 'exampleImage',
    comment: 'Links a class to an example image.',
    isLocal: true,
    initialValues: [],
    onChange,
    ...overrides,
  });
  return { api, onChange };
}

describe('annotationValuesSection', () => {
  it('renders URL-like values as links and plain text as spans, each with a delete control', () => {
    make({ initialValues: ['https://example.com/a.png', 'a plain note'] });
    const link = container.querySelector('a');
    expect(link?.textContent).toBe('https://example.com/a.png');
    const span = [...container.querySelectorAll('span')].find((s) => s.textContent === 'a plain note');
    expect(span).toBeTruthy();
    expect(container.querySelectorAll('button[title="Remove value"]').length).toBe(2);
  });

  it('uses the rdfs:comment as the input placeholder', () => {
    make();
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.placeholder).toBe('Links a class to an example image.');
  });

  it('falls back to a generic placeholder when there is no comment', () => {
    make({ comment: null });
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.placeholder).toBe('Enter a value');
  });

  it('adds a value via the Add button', () => {
    const { onChange } = make();
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    input.value = 'https://example.com/new.png';
    (container.querySelector('button[title="Add this value"]') as HTMLButtonElement).click();
    expect(onChange).toHaveBeenCalledWith(['https://example.com/new.png']);
  });

  it('adds a value on Enter without letting the keydown reach the modal', () => {
    const modalEnter = vi.fn();
    document.addEventListener('keydown', modalEnter);
    const { onChange } = make();
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    input.value = 'note text';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(modalEnter).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(['note text']);
    document.removeEventListener('keydown', modalEnter);
  });

  it('deletes a value', () => {
    const { onChange } = make({ initialValues: ['https://example.com/a.png', 'https://example.com/b.png'] });
    const firstDelete = container.querySelector('button[title="Remove value"]') as HTMLButtonElement;
    firstDelete.click();
    expect(onChange).toHaveBeenCalledWith(['https://example.com/b.png']);
  });

  it('shows no input or delete controls when not editable (isLocal=false)', () => {
    make({ isLocal: false, initialValues: ['https://example.com/a.png'] });
    expect(container.querySelector('input[type="text"]')).toBeNull();
    expect(container.querySelector('button[title="Remove value"]')).toBeNull();
    // The value is still shown as a link.
    expect(container.querySelector('a')?.textContent).toBe('https://example.com/a.png');
  });
});
