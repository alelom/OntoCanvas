import { LAYOUT_MODE_INFO } from '../layouts/layoutModeInfo';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render the hint-popup body: every layout mode with its description, the active mode
 * highlighted. Pure so it can be unit-tested.
 */
export function renderLayoutModeHint(activeId: string): string {
  return LAYOUT_MODE_INFO.map((m) => {
    const active = m.id === activeId;
    const border = active ? '2px solid #2c7be5' : '1px solid #e0e0e0';
    const bg = active ? '#eaf2fe' : '#fff';
    return (
      `<div style="margin-bottom: 6px; padding: 6px 8px; border: ${border}; border-radius: 4px; background: ${bg};">` +
      `<div style="font-weight: bold; font-size: 12px; color: #2c3e50;">${escapeHtml(m.label)}${active ? ' — current' : ''}</div>` +
      `<div style="font-size: 11px; color: #555; margin-top: 2px; line-height: 1.35;">${escapeHtml(m.description)}</div>` +
      `</div>`
    );
  }).join('');
}

/**
 * Wire the layout-mode hint popup: an info icon toggles a popup listing every mode and its
 * logic, mirroring the existing "Text display options" popup pattern. Also sets each
 * dropdown option's native tooltip from the same descriptions. No-op if the elements are
 * absent (e.g. before the viz controls are rendered).
 */
export function initLayoutModeHint(): void {
  const select = document.getElementById('layoutMode') as HTMLSelectElement | null;
  const toggle = document.getElementById('layoutModeHintToggle');
  const popup = document.getElementById('layoutModeHintPopup');
  const wrap = document.getElementById('layoutModeHintWrap');
  if (!select || !toggle || !popup || !wrap) return;

  // Native per-option tooltips from the same source of truth.
  for (const opt of Array.from(select.options)) {
    const info = LAYOUT_MODE_INFO.find((m) => m.id === opt.value);
    if (info) opt.title = info.description;
  }

  const refresh = () => {
    popup.innerHTML = renderLayoutModeHint(select.value);
  };
  refresh();
  select.addEventListener('change', refresh);

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = popup.style.display === 'block';
    if (!isVisible) refresh();
    popup.style.display = isVisible ? 'none' : 'block';
  });
  document.addEventListener('click', (e) => {
    if (popup.style.display === 'block' && !wrap.contains(e.target as Node)) {
      popup.style.display = 'none';
    }
  });
}
