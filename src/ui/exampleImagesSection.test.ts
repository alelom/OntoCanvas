/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';

// The add flow validates URLs asynchronously (network reachability); stub it so these tests
// exercise only the add wiring (Enter / button / blur), not the network.
vi.mock('../lib/exampleImageUrlValidation', () => ({
  validateExampleImageUrl: vi.fn(async () => null),
  resolveImageUrl: vi.fn((url: string) => url),
}));

import { initExampleImagesSection } from './exampleImagesSection';

const noop = (): void => {};
const noopAsync = async (): Promise<void> => {};

function makeSection(overrides: Partial<Parameters<typeof initExampleImagesSection>[1]> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const api = initExampleImagesSection(container, {
    nodeId: 'Test',
    isLocal: true,
    initialUris: [],
    ontologyLocation: null,
    onAddImage: noopAsync,
    onDelete: noop,
    onOpen: noop,
    onUrisChange: noop,
    ...overrides,
  });
  return { container, api };
}

describe('exampleImagesSection', () => {
  it('does not render inline URL/read-only warning when !isLocal (tip is in modal header)', () => {
    const container = document.createElement('div');
    initExampleImagesSection(container, {
      nodeId: 'Test',
      isLocal: false,
      initialUris: [],
      ontologyLocation: null,
      onAddImage: noopAsync,
      onDelete: noop,
      onOpen: noop,
      onUrisChange: noop,
    });
    const text = container.textContent ?? '';
    expect(text).not.toContain('Ontology is opened from a URL');
    expect(text).not.toContain('Example images are read-only');
  });

  it('renders existing images as clickable links with the URL text', () => {
    const container = document.createElement('div');
    const opened: string[] = [];
    initExampleImagesSection(container, {
      nodeId: 'Test',
      isLocal: true,
      initialUris: ['img/a.png'],
      ontologyLocation: null,
      onAddImage: noopAsync,
      onDelete: noop,
      onOpen: (u) => opened.push(u),
      onUrisChange: noop,
    });
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link!.textContent).toBe('img/a.png');
    link!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(opened).toEqual(['img/a.png']);
    // The URL input is present too.
    expect((container.querySelector('input[type="text"]') as HTMLInputElement)?.placeholder).toContain('Enter image URL');
  });

  it('renders an Add button when isLocal', () => {
    const { container } = makeSection();
    const addBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Add');
    expect(addBtn).toBeTruthy();
  });

  it('adds the URL on Enter and stops the keydown from reaching the modal (no close)', async () => {
    const modalEnter = vi.fn();
    document.addEventListener('keydown', modalEnter);
    const onUrisChange = vi.fn();
    const { container } = makeSection({ onUrisChange });
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    input.value = 'https://example.com/a.png';

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    // stopPropagation -> the modal's document-level Enter handler must never see this event.
    expect(modalEnter).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(onUrisChange).toHaveBeenCalledWith(['https://example.com/a.png']));

    document.removeEventListener('keydown', modalEnter);
  });

  it('adds the URL when the Add button is clicked', async () => {
    const onUrisChange = vi.fn();
    const { container } = makeSection({ onUrisChange });
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    input.value = 'https://example.com/b.png';
    const addBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Add') as HTMLButtonElement;

    addBtn.click();

    await vi.waitFor(() => expect(onUrisChange).toHaveBeenCalledWith(['https://example.com/b.png']));
  });
});
