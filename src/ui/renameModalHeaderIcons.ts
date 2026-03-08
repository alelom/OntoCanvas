/**
 * Edit class properties modal: header icons (ℹ️ info, 💡 tip) and click-to-show popover.
 * Tip appears only when ontology is opened from URL; pulsating animation stops after first click.
 */

const TIP_MESSAGE =
  'The ontology was opened from a URL. If you download its definition (e.g owl or TTL file) and open that instead, you will be able to add/modify example images for this class.';

const INFO_MESSAGE =
  'Edit the label, comment, example images, annotation properties, and data property restrictions for this class.';

const POPOVER_ID = 'renameModalPopover';
const TIP_BTN_ID = 'renameModalTipBtn';
const INFO_BTN_ID = 'renameModalInfoBtn';
const PULSE_CLASS = 'rename-tip-btn-pulse';

function getPopoverEl(): HTMLElement | null {
  return document.getElementById(POPOVER_ID);
}

function getTipBtn(): HTMLElement | null {
  return document.getElementById(TIP_BTN_ID);
}

function getInfoBtn(): HTMLElement | null {
  return document.getElementById(INFO_BTN_ID);
}

function positionPopover(anchor: HTMLElement, popover: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  popover.style.position = 'fixed';
  popover.style.left = `${rect.left}px`;
  popover.style.top = `${rect.bottom + 6}px`;
  popover.style.maxWidth = 'min(320px, 100vw - 24px)';
  // Prefer opening above if too close to bottom
  const popoverHeight = 80;
  if (rect.bottom + popoverHeight + 8 > window.innerHeight && rect.top - popoverHeight - 8 > 0) {
    popover.style.top = `${rect.top - popoverHeight - 8}px`;
  }
}

function showPopover(anchor: HTMLElement, content: string): void {
  const popover = getPopoverEl();
  if (!popover) return;
  popover.textContent = content;
  positionPopover(anchor, popover);
  popover.classList.add('rename-popover-visible');
}

export function hideRenameModalPopover(): void {
  const popover = getPopoverEl();
  if (popover) popover.classList.remove('rename-popover-visible');
}

function hidePopover(): void {
  hideRenameModalPopover();
}

/**
 * Call once after DOM ready to create the popover element and attach click handlers.
 * Expects #renameModal to contain #renameModalTipBtn and #renameModalInfoBtn.
 */
export function initRenameModalHeaderIcons(modalElement: HTMLElement): void {
  const content = modalElement.querySelector('.modal-content');
  if (!content) return;

  let popover = getPopoverEl();
  if (!popover) {
    popover = document.createElement('div');
    popover.id = POPOVER_ID;
    popover.setAttribute('role', 'tooltip');
    popover.className = 'rename-popover';
    content.appendChild(popover);
  }

  const tipBtn = getTipBtn();
  const infoBtn = getInfoBtn();

  function onTipClick(btn: HTMLElement) {
    const isOpen = getPopoverEl()?.classList.contains('rename-popover-visible') && getPopoverEl()?.textContent === TIP_MESSAGE;
    if (isOpen) hidePopover();
    else {
      showPopover(btn, TIP_MESSAGE);
      btn.classList.remove(PULSE_CLASS);
    }
  }
  function onInfoClick(btn: HTMLElement) {
    const isOpen = getPopoverEl()?.classList.contains('rename-popover-visible') && getPopoverEl()?.textContent === INFO_MESSAGE;
    if (isOpen) hidePopover();
    else showPopover(btn, INFO_MESSAGE);
  }

  tipBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    onTipClick(e.currentTarget as HTMLElement);
  });
  tipBtn?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onTipClick(e.currentTarget as HTMLElement);
    }
  });

  infoBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    onInfoClick(e.currentTarget as HTMLElement);
  });
  infoBtn?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onInfoClick(e.currentTarget as HTMLElement);
    }
  });

  modalElement.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest(`#${POPOVER_ID}`) || target.closest(`#${TIP_BTN_ID}`) || target.closest(`#${INFO_BTN_ID}`)) return;
    hidePopover();
  });
}

/**
 * Show or hide the tip (💡) button and optionally apply pulsating animation.
 * Call from showRenameModal(showTip = !fileHandle) and showMultiEditModal(showTip = false).
 */
export function setRenameModalTipButtonVisible(visible: boolean): void {
  const tipBtn = getTipBtn();
  if (!tipBtn) return;
  tipBtn.style.display = visible ? 'inline' : 'none';
  if (visible) {
    tipBtn.classList.add(PULSE_CLASS);
  } else {
    tipBtn.classList.remove(PULSE_CLASS);
  }
}
