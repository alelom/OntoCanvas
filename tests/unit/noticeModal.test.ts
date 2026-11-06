// @vitest-environment jsdom
/**
 * The small modal an error, or a warning marked to pop up, opens once it is set (#240): so a problem found while loading, such as
 * a folder whose images the browser could not see, is noticed. It is dismissed with OK, ×, Escape or a click beside it, and the
 * notice stays in the bottom bar.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isNoticeMuted, popUpNotice, showNoticeModal } from '../../src/ui/noticeModal';
import { LONG_PATH_SUMMARY } from '../../src/ui/sidePanel/imageProblem';

const modal = () => document.querySelector<HTMLElement>('[data-notice-modal]');
const items = () => [...document.querySelectorAll('[data-notice-modal-item]')].map((i) => i.textContent ?? '');

describe('showNoticeModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
  });

  it('shows a warning with its help folded, as a dialog, with no OK button, and closes on its ×', () => {
    showNoticeModal({ key: 'folder', message: "run-0001: 13 images its data names aren't in the folder.", level: 'warning', alert: true, help: { kind: 'long-path', folder: 'run-0001' } });

    expect(modal()!.getAttribute('role')).toBe('dialog');
    expect(modal()!.querySelector('h3')!.textContent).toBe('Warning');
    expect(items()[0]).toContain("run-0001: 13 images its data names aren't in the folder.");
    expect(modal()!.querySelector('[data-individuals-image-help] summary')!.textContent).toBe(LONG_PATH_SUMMARY);

    expect([...modal()!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['×']);
    expect(modal()!.textContent).not.toContain('bottom bar');

    modal()!.querySelector<HTMLButtonElement>('[data-notice-modal-close]')!.click();
    expect(modal()).toBeNull();
  });

  it('adds a second notice to the one open rather than stacking modals, and an error makes it an error', () => {
    showNoticeModal({ key: 'a', message: 'Missing images.', level: 'warning', alert: true });
    showNoticeModal({ key: 'b', message: 'Something failed.', level: 'error' });

    expect(document.querySelectorAll('[data-notice-modal]')).toHaveLength(1);
    expect(items()).toEqual(['Missing images.', 'Something failed.']);
    expect(modal()!.querySelector('h3')!.textContent).toBe('Error');
  });

  it("offers to stop the pop-up for what the notice is about, for this session, kept when it is closed", () => {
    showNoticeModal({ key: 'folder-images:1', message: 'Missing images.', level: 'warning', alert: true, mute: { key: 'folder-images:run-0001', label: 'this folder (run-0001)' } });
    showNoticeModal({ key: 'other', message: 'Something failed.', level: 'error' });

    const boxes = document.querySelectorAll<HTMLInputElement>('[data-notice-modal-mute]');
    expect(boxes).toHaveLength(1);
    expect(boxes[0].closest('label')!.textContent).toBe("Don't show this again for this folder (run-0001) in this session");
    expect(isNoticeMuted('folder-images:run-0001')).toBe(false);

    boxes[0].click();
    modal()!.querySelector<HTMLButtonElement>('[data-notice-modal-close]')!.click();

    expect(isNoticeMuted('folder-images:run-0001')).toBe(true);
    expect(isNoticeMuted('folder-images:run-0002')).toBe(false);
  });

  it('waits for the loading screen to go before popping up, so it is seen once the load is over', async () => {
    document.body.innerHTML = '<div id="loadingModal" style="display: flex"></div>';

    popUpNotice({ key: 'a', message: 'Missing images.', level: 'warning', alert: true });
    expect(modal()).toBeNull();

    document.getElementById('loadingModal')!.style.display = 'none';

    await vi.waitFor(() => expect(modal()).not.toBeNull());
    expect(items()).toEqual(['Missing images.']);
  });

  it('replaces the message of a notice already shown, and closes on Escape and on a click beside it', () => {
    showNoticeModal({ key: 'a', message: 'Old.', level: 'error' });
    showNoticeModal({ key: 'a', message: 'New.', level: 'error' });
    expect(items()).toEqual(['New.']);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(modal()).toBeNull();

    showNoticeModal({ key: 'a', message: 'Again.', level: 'error' });
    modal()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(modal()).toBeNull();
  });
});
