// @vitest-environment jsdom
/**
 * The file part of the page (moved out of main.ts, #175): the save button, the open file's path, the serializer choice.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const debug = vi.hoisted(() => ({ on: true }));
vi.mock('../../src/utils/debug', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/debug')>()),
  isDebugMode: () => debug.on,
}));
const statusBar = vi.hoisted(() => ({ updateFilePathDisplay: vi.fn() }));
vi.mock('../../src/ui/statusBar', () => statusBar);

import { fileState } from '../../src/state/appState';
import { updateFilePathDisplay, updateSaveButtonVisibility, updateSerializerDropdown } from '../../src/ui/fileBar';

beforeEach(() => {
  document.body.innerHTML = '';
  debug.on = true;
  statusBar.updateFilePathDisplay.mockClear();
  Object.assign(fileState, { hasUnsavedChanges: false, loadedFilePath: null, isTtlFile: false, originalFileCache: null, currentSerializerType: 'custom' });
});

describe('updateSaveButtonVisibility', () => {
  const group = () => document.getElementById('saveGroup')!;

  it('shows the save group while there are unsaved changes and hides it otherwise', () => {
    document.body.innerHTML = '<span id="saveGroup"></span>';

    fileState.hasUnsavedChanges = true;
    updateSaveButtonVisibility();
    expect(group().style.display).toBe('inline-flex');

    fileState.hasUnsavedChanges = false;
    updateSaveButtonVisibility();
    expect(group().style.display).toBe('none');
  });

  it('does nothing when the page has no save group', () => {
    expect(() => updateSaveButtonVisibility()).not.toThrow();
  });
});

describe('updateFilePathDisplay', () => {
  it('passes the open file\'s path to the status bar', () => {
    fileState.loadedFilePath = 'C:/work/onto.ttl';
    updateFilePathDisplay();
    expect(statusBar.updateFilePathDisplay).toHaveBeenCalledWith('C:/work/onto.ttl');
  });
});

describe('updateSerializerDropdown', () => {
  const select = () => document.getElementById('serializerSelect') as HTMLSelectElement;
  const customOption = () => select().querySelector<HTMLOptionElement>('option[value="custom"]')!;
  beforeEach(() => {
    document.body.innerHTML = '<select id="serializerSelect"><option value="custom">c</option><option value="rdflib">r</option></select>';
  });

  it('does nothing when there is no dropdown', () => {
    document.body.innerHTML = '';
    expect(() => updateSerializerDropdown()).not.toThrow();
  });

  it('hides the dropdown outside debug mode, or for a file that is not Turtle', () => {
    fileState.isTtlFile = true;
    debug.on = false;
    updateSerializerDropdown();
    expect(select().style.display).toBe('none');

    debug.on = true;
    fileState.isTtlFile = false;
    updateSerializerDropdown();
    expect(select().style.display).toBe('none');
  });

  it('shows the current serializer for a Turtle file in debug mode, and enables "custom" when there is a Turtle cache', () => {
    fileState.isTtlFile = true;
    fileState.currentSerializerType = 'custom';
    fileState.originalFileCache = { format: 'turtle' } as typeof fileState.originalFileCache;

    updateSerializerDropdown();

    expect(select().style.display).toBe('inline-block');
    expect(select().value).toBe('custom');
    expect(customOption().disabled).toBe(false);
    expect(fileState.currentSerializerType).toBe('custom');
  });

  it('disables "custom" without a Turtle cache and falls back to rdflib if it was chosen', () => {
    fileState.isTtlFile = true;
    fileState.currentSerializerType = 'custom';

    updateSerializerDropdown();

    expect(customOption().disabled).toBe(true);
    expect(customOption().title).toMatch(/requires file cache/);
    expect(fileState.currentSerializerType).toBe('rdflib');
    expect(select().value).toBe('rdflib');
  });
});
