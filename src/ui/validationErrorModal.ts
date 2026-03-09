/**
 * Modal for displaying ontology validation errors in a formatted, scrollable view.
 */
import type { ValidationResult } from '../lib/ontologyValidation';
import { formatValidationErrorsHtml } from '../lib/ontologyValidation';

const MODAL_STYLE = `
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
`;

const CONTENT_STYLE = `
  background: #fff;
  padding: 0;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  min-width: 500px;
  max-width: 700px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
`;

const TITLE_STYLE = `
  margin: 0;
  padding: 20px 24px;
  font-size: 20px;
  font-weight: 600;
  color: #c0392b;
  border-bottom: 1px solid #e0e0e0;
`;

const BODY_STYLE = `
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
  font-size: 14px;
  line-height: 1.6;
  color: #333;
`;

const CLOSE_BUTTON_STYLE = `
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  font-size: 24px;
  color: #666;
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
`;

const CLOSE_BUTTON_HOVER_STYLE = `
  background: #f0f0f0;
  color: #333;
`;

/**
 * Show a modal with validation errors.
 */
export function showValidationErrorModal(validationResult: ValidationResult): void {
  // Remove any existing validation error modal
  const existing = document.getElementById('validationErrorModal');
  if (existing) {
    existing.remove();
  }

  const overlay = document.createElement('div');
  overlay.id = 'validationErrorModal';
  overlay.style.cssText = MODAL_STYLE;

  const content = document.createElement('div');
  content.style.cssText = CONTENT_STYLE;

  const title = document.createElement('h2');
  title.style.cssText = TITLE_STYLE;
  const errorCount = validationResult.errors.length;
  const warningCount = validationResult.warnings.length;
  let titleText = 'Cannot open ontology';
  if (errorCount > 0 && warningCount > 0) {
    titleText += `: ${errorCount} error${errorCount !== 1 ? 's' : ''} and ${warningCount} warning${warningCount !== 1 ? 's' : ''} found`;
  } else if (errorCount > 0) {
    titleText += `: ${errorCount} error${errorCount !== 1 ? 's' : ''} found`;
  } else if (warningCount > 0) {
    titleText += `: ${warningCount} warning${warningCount !== 1 ? 's' : ''} found`;
  }
  title.textContent = titleText;

  const closeButton = document.createElement('button');
  closeButton.textContent = '×';
  closeButton.style.cssText = CLOSE_BUTTON_STYLE;
  closeButton.title = 'Close (Esc)';
  closeButton.addEventListener('mouseenter', () => {
    closeButton.style.cssText = CLOSE_BUTTON_STYLE + CLOSE_BUTTON_HOVER_STYLE;
  });
  closeButton.addEventListener('mouseleave', () => {
    closeButton.style.cssText = CLOSE_BUTTON_STYLE;
  });
  closeButton.addEventListener('click', () => {
    overlay.remove();
    document.body.style.overflow = '';
  });

  const body = document.createElement('div');
  body.style.cssText = BODY_STYLE;
  body.innerHTML = formatValidationErrorsHtml(validationResult);

  content.appendChild(title);
  content.appendChild(closeButton);
  content.appendChild(body);
  overlay.appendChild(content);

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      document.body.style.overflow = '';
    }
  });

  // Close on Escape key
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // Prevent body scroll
  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);
}

/**
 * Hide the validation error modal if it exists.
 */
export function hideValidationErrorModal(): void {
  const existing = document.getElementById('validationErrorModal');
  if (existing) {
    existing.remove();
    document.body.style.overflow = '';
  }
}
