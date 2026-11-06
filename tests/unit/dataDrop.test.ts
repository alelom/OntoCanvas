// @vitest-environment jsdom
/**
 * Dropping data files (#222): onto the Individuals tab, and onto the canvas while that tab is open. Only files are taken, only
 * while enabled; otherwise the browser does what it does with a drop.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { attachDataDrop, DROP_ACTIVE_CLASS } from '../../src/ui/dataDrop';

let target: HTMLElement;
let enabled: boolean;
let onDrop: ReturnType<typeof vi.fn>;

const files = [{ name: 'a.ttl' }, { name: 'part-0001.nq.gz' }];

/** A drag event as the browser fires it, carrying files (or text, which has no 'Files' type). */
function drag(type: string, kind: 'Files' | 'text/plain' = 'Files', on: EventTarget = target, relatedTarget: EventTarget | null = null): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: [kind], files: kind === 'Files' ? files : [], dropEffect: 'none' },
  });
  Object.defineProperty(event, 'relatedTarget', { value: relatedTarget });
  on.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="t"><span id="inner"></span></div><div id="out"></div>';
  target = document.getElementById('t')!;
  enabled = true;
  onDrop = vi.fn();
  attachDataDrop(target, { enabled: () => enabled, onDrop });
});

describe('attachDataDrop', () => {
  it('takes the files dropped, all of them, in order', () => {
    const event = drag('drop');

    expect(event.defaultPrevented).toBe(true);
    expect(onDrop).toHaveBeenCalledWith({ files, folders: [] });
  });

  it('accepts a drag of files (so the drop happens) and shows where they go, until the drag leaves', () => {
    const over = drag('dragover');

    expect(over.defaultPrevented).toBe(true);
    expect((over as DragEvent).dataTransfer!.dropEffect).toBe('copy');
    expect(target.classList.contains(DROP_ACTIVE_CLASS)).toBe(true);

    drag('dragleave', 'Files', target, document.getElementById('inner'));
    expect(target.classList.contains(DROP_ACTIVE_CLASS)).toBe(true);
    drag('dragleave', 'Files', target, document.getElementById('out'));
    expect(target.classList.contains(DROP_ACTIVE_CLASS)).toBe(false);
  });

  it('stops showing where they go once they are dropped', () => {
    drag('dragover');
    drag('drop');

    expect(target.classList.contains(DROP_ACTIVE_CLASS)).toBe(false);
  });

  it('leaves alone a drag that carries no files, such as text', () => {
    expect(drag('dragover', 'text/plain').defaultPrevented).toBe(false);
    expect(drag('drop', 'text/plain').defaultPrevented).toBe(false);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('leaves every drag alone while it is not enabled (the Individuals tab is not open)', () => {
    enabled = false;

    expect(drag('dragover').defaultPrevented).toBe(false);
    expect(drag('drop').defaultPrevented).toBe(false);
    expect(target.classList.contains(DROP_ACTIVE_CLASS)).toBe(false);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('takes a drop on an element inside the target', () => {
    drag('drop', 'Files', document.getElementById('inner')!);

    expect(onDrop).toHaveBeenCalledWith({ files, folders: [] });
  });
});

describe('a folder dropped (#227)', () => {
  it('takes a folder as a folder, listed only when it is added, and the files beside it as files', async () => {
    const dropped = new File(['x'], 'loose.ttl');
    const folderEntry = {
      name: 'run-0001',
      isFile: false,
      isDirectory: true,
      createReader: () => {
        let read = false;
        return { readEntries: (ok: (e: unknown[]) => void) => ok(read ? [] : ((read = true), [{ name: 'part-0001.nq.gz', isFile: true, isDirectory: false, file: (cb: (f: File) => void) => cb(new File(['y'], 'part-0001.nq.gz')) }])) };
      },
    };
    const items = [
      { kind: 'file', webkitGetAsEntry: () => folderEntry, getAsFile: () => null },
      { kind: 'file', webkitGetAsEntry: () => ({ isDirectory: false }), getAsFile: () => dropped },
      { kind: 'string', webkitGetAsEntry: () => null, getAsFile: () => null },
    ];
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files: [], items, dropEffect: 'none' } });

    target.dispatchEvent(event);

    const pick = onDrop.mock.calls[0][0];
    expect(pick.files).toEqual([dropped]);
    expect(pick.folders).toHaveLength(1);
    const contents = await pick.folders[0]({});
    expect([contents.name, contents.data.map((f: { path: string }) => f.path)]).toEqual(['run-0001', ['part-0001.nq.gz']]);
  });
});
