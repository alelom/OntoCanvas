/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  initRenameModalHeaderIcons,
  setRenameModalTipButtonVisible,
  hideRenameModalPopover,
} from './renameModalHeaderIcons';

function createModalDOM(): HTMLElement {
  const modal = document.createElement('div');
  modal.id = 'renameModal';
  const content = document.createElement('div');
  content.className = 'modal-content';
  content.innerHTML = `
    <div class="rename-modal-header">
      <h3>Edit class properties</h3>
      <div id="renameModalHeaderIcons">
        <span id="renameModalTipBtn" style="display: none;">💡</span>
        <span id="renameModalInfoBtn">ℹ️</span>
      </div>
    </div>
  `;
  modal.appendChild(content);
  document.body.appendChild(modal);
  return modal;
}

describe('renameModalHeaderIcons', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    hideRenameModalPopover();
  });

  it('setRenameModalTipButtonVisible shows tip button and adds pulse class when visible', () => {
    createModalDOM();
    const tipBtn = document.getElementById('renameModalTipBtn')!;
    setRenameModalTipButtonVisible(true);
    expect(tipBtn.style.display).toBe('inline');
    expect(tipBtn.classList.contains('rename-tip-btn-pulse')).toBe(true);
  });

  it('setRenameModalTipButtonVisible hides tip button and removes pulse when not visible', () => {
    createModalDOM();
    const tipBtn = document.getElementById('renameModalTipBtn')!;
    setRenameModalTipButtonVisible(true);
    setRenameModalTipButtonVisible(false);
    expect(tipBtn.style.display).toBe('none');
    expect(tipBtn.classList.contains('rename-tip-btn-pulse')).toBe(false);
  });

  it('initRenameModalHeaderIcons creates popover element', () => {
    const modal = createModalDOM();
    initRenameModalHeaderIcons(modal);
    expect(document.getElementById('renameModalPopover')).not.toBeNull();
  });
});
