/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { initExampleImagesSection } from './exampleImagesSection';

const noop = (): void => {};
const noopAsync = async (): Promise<string | null> => null;

describe('exampleImagesSection', () => {
  it('does not render inline URL/read-only warning when !isLocal (tip is in modal header)', () => {
    const container = document.createElement('div');
    initExampleImagesSection(container, {
      nodeId: 'Test',
      isLocal: false,
      initialUris: [],
      onAddImage: noopAsync,
      onDelete: noop,
      onOpen: noop,
      onUrisChange: noop,
    });
    const text = container.textContent ?? '';
    expect(text).not.toContain('Ontology is opened from a URL');
    expect(text).not.toContain('Example images are read-only');
  });

  it('renders list and add button when isLocal', () => {
    const container = document.createElement('div');
    initExampleImagesSection(container, {
      nodeId: 'Test',
      isLocal: true,
      initialUris: ['img/a.png'],
      onAddImage: noopAsync,
      onDelete: noop,
      onOpen: noop,
      onUrisChange: noop,
    });
    expect(container.textContent).toContain('img/a.png');
    const addBtn = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Add example image')
    );
    expect(addBtn).toBeDefined();
  });
});
