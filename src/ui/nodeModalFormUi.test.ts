/**
 * Unit tests for syncAddNodeModal (external tab duplicate by URI).
 * Uses minimal DOM stubs to avoid jsdom dependency.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { syncAddNodeModal } from './nodeModalFormUi';

function makeEl(id: string, tag: string): { id: string; style: { display: string }; disabled?: boolean; textContent: string } {
  return {
    id,
    style: { display: 'none' },
    textContent: '',
    ...(tag === 'button' && { disabled: false }),
  };
}

describe('syncAddNodeModal', () => {
  let okBtn: ReturnType<typeof makeEl> & { disabled: boolean };
  let dupErr: ReturnType<typeof makeEl>;
  let extDupErr: ReturnType<typeof makeEl>;
  let getElementById: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    okBtn = makeEl('addNodeConfirm', 'button') as ReturnType<typeof makeEl> & { disabled: boolean };
    okBtn.disabled = false;
    dupErr = makeEl('addNodeDuplicateError', 'div');
    extDupErr = makeEl('addNodeExternalDuplicateError', 'div');
    getElementById = vi.fn((id: string) => {
      if (id === 'addNodeConfirm') return okBtn;
      if (id === 'addNodeDuplicateError') return dupErr;
      if (id === 'addNodeExternalDuplicateError') return extDupErr;
      return null;
    });
    vi.stubGlobal('document', { getElementById });
  });

  describe('external tab duplicate by URI', () => {
    it('shows external duplicate error and disables OK when externalClassUri is in existingIds', () => {
      const externalUri = 'http://example.org/project-mgmt#Project';
      syncAddNodeModal({
        store: null,
        existingIds: new Set([externalUri, 'http://example.org/task-assignment#Task']),
        label: '',
        externalLabel: 'Project',
        externalClassUri: externalUri,
        isCustomTab: false,
      });
      expect(extDupErr.style.display).toBe('block');
      expect(okBtn.disabled).toBe(true);
    });

    it('enables OK when external tab and externalClassUri not in existingIds', () => {
      syncAddNodeModal({
        store: null,
        existingIds: new Set(['http://example.org/task-assignment#Task']),
        label: '',
        externalLabel: 'Project',
        externalClassUri: 'http://example.org/project-mgmt#Project',
        isCustomTab: false,
      });
      expect(extDupErr.style.display).toBe('none');
      expect(okBtn.disabled).toBe(false);
    });
  });
});
