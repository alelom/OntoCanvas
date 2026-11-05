/**
 * Dropping data files onto an element (#222): the Individuals tab, and the canvas while that tab is open. A drag that carries
 * files is accepted (a drop only happens on an element that accepted the drag) and the element is marked while it is over it.
 * Anything else, or any drag while not enabled, is left to the browser.
 */

export const DROP_ACTIVE_CLASS = 'data-drop-active';

export interface DataDropOptions {
  /** Whether a drop is taken now. */
  enabled: () => boolean;
  onFiles: (files: File[]) => void;
}

const carriesFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer?.types ?? []).includes('Files');

export function attachDataDrop(target: HTMLElement, { enabled, onFiles }: DataDropOptions): void {
  const accept = (event: DragEvent): void => {
    if (!enabled() || !carriesFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    target.classList.add(DROP_ACTIVE_CLASS);
  };
  target.addEventListener('dragenter', accept);
  target.addEventListener('dragover', accept);
  target.addEventListener('dragleave', (event) => {
    // Leaving for an element inside the target is not leaving it.
    const to = event.relatedTarget;
    if (to instanceof Node && target.contains(to)) return;
    target.classList.remove(DROP_ACTIVE_CLASS);
  });
  target.addEventListener('drop', (event) => {
    target.classList.remove(DROP_ACTIVE_CLASS);
    if (!enabled() || !carriesFiles(event)) return;
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length) onFiles(files);
  });
}
